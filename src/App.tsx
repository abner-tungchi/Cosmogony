import { useEffect, useState } from 'react';
import { Board } from './components/Board/Board';
import { Sidebar } from './components/Sidebar/Sidebar';
import { TabBar } from './components/TabBar/TabBar';
import { PathBar } from './components/PathBar/PathBar';
import { Homepage } from './components/Homepage/Homepage';
import { HintBar } from './components/HintBar/HintBar';
import { useBoardStore, selectActiveBoard } from './store/boardStore';
import { useUIStore } from './store/uiStore';
import { useApiSync } from './utils/apiSync';

function App() {
  useApiSync();
  const { deleteNote, deleteRemodel } = useBoardStore();
  const activeBoard = useBoardStore(selectActiveBoard);
  const {
    selectedNoteIds,
    setSelectedNoteIds,
    currentView,
    selectedElementId,
    selectedElementType,
    setSelectedElement,
  } = useUIStore();
  const [sidebarWidth, setSidebarWidth] = useState(240);

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
          right: 0,
          bottom: 0,
          transition: 'left 0.2s ease',
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
    </div>
  );
}

export default App;
