import { useEffect, useState } from 'react';
import { Board } from './components/Board/Board';
import { Sidebar } from './components/Sidebar/Sidebar';
import { TabBar } from './components/TabBar/TabBar';
import { PathBar } from './components/PathBar/PathBar';
import { Homepage } from './components/Homepage/Homepage';
import { HintBar } from './components/HintBar/HintBar';
import { RightColumn } from './components/Coach/RightColumn';
import { useBoardStore } from './store/boardStore';
import { useActiveBoard } from './store/selectors';
import { useUIStore } from './store/uiStore';
import { useApiSync } from './utils/apiSync';
import { useReconcileUIState } from './hooks/useReconcileUIState';

const RIGHT_COLUMN_WIDTH_KEY = 'es-right-column-width';
const LEGACY_DETAIL_PANEL_WIDTH_KEY = 'es-detail-panel-width';
const RIGHT_COLUMN_DEFAULT_WIDTH = 480;

function readRightColumnWidth(): number {
  try {
    const raw = localStorage.getItem(RIGHT_COLUMN_WIDTH_KEY) ?? localStorage.getItem(LEGACY_DETAIL_PANEL_WIDTH_KEY);
    const n = raw ? parseInt(raw, 10) : NaN;
    if (Number.isFinite(n)) return n;
  } catch {
    // ignore
  }
  return RIGHT_COLUMN_DEFAULT_WIDTH;
}

function App() {
  useApiSync();
  useReconcileUIState();
  const { deleteNote, deleteRemodel } = useBoardStore();
  const activeBoard = useActiveBoard();
  const {
    selectedNoteIds,
    setSelectedNoteIds,
    currentView,
    selectedElementId,
    selectedElementType,
    setSelectedElement,
  } = useUIStore();
  const [sidebarWidth, setSidebarWidth] = useState(240);
  const [rightColumnWidth, setRightColumnWidth] = useState(readRightColumnWidth);

  useEffect(() => {
    // RightColumn 自身會寫入 localStorage；App.tsx 透過 storage 事件同步 width
    // 以便中央 fixed 容器的 right offset 即時跟隨。
    const onStorage = (e: StorageEvent) => {
      if (e.key === RIGHT_COLUMN_WIDTH_KEY) {
        setRightColumnWidth(readRightColumnWidth());
      }
    };
    window.addEventListener('storage', onStorage);
    // 同 tab 內 RightColumn 改 width 後，用 polling 補強（storage 事件不跨同 tab）
    const id = window.setInterval(() => {
      const cur = readRightColumnWidth();
      setRightColumnWidth((prev) => (prev !== cur ? cur : prev));
    }, 250);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.clearInterval(id);
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isEditingText =
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable;

      if (e.key === 'Escape') {
        if (isEditingText) return;
        setSelectedNoteIds([]);
        setSelectedElement(null, null);
        return;
      }

      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (isEditingText) return;

        // Delete multi-selected notes
        if (selectedNoteIds.length > 0) {
          selectedNoteIds.forEach((id) => deleteNote(id));
          setSelectedNoteIds([]);
          setSelectedElement(null, null);
          return;
        }

        // Delete single element selected via Detail Panel
        if (selectedElementId && selectedElementType) {
          if (selectedElementType === 'note') {
            deleteNote(selectedElementId);
          } else if (selectedElementType === 'remodel') {
            deleteRemodel(selectedElementId);
          }
          setSelectedElement(null, null);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedNoteIds, selectedElementId, selectedElementType, deleteNote, deleteRemodel, setSelectedNoteIds, setSelectedElement]);

  return (
    <div style={{ width: '100vw', height: '100vh', overflow: 'hidden', display: 'flex' }}>
      <HintBar />
      <Sidebar onWidthChange={setSidebarWidth} />
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: sidebarWidth,
          right: rightColumnWidth,
          bottom: 0,
          transition: 'left 0.2s ease, right 0.2s ease',
        }}
      >
        <TabBar />
        {currentView === 'board' && <PathBar />}
        <div
          style={{
            position: 'absolute',
            top: currentView === 'board' ? 84 : 40,
            left: 0,
            right: 0,
            bottom: 0,
            overflow: 'hidden',
            transition: 'top 0.15s ease',
          }}
        >
          {currentView === 'home' ? (
            <Homepage />
          ) : (
            <Board key={activeBoard.id} />
          )}
        </div>
      </div>
      <RightColumn />
    </div>
  );
}

export default App;
