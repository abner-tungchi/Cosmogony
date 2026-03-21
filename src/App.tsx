import { useEffect, useState } from 'react';
import { Board } from './components/Board/Board';
import { Sidebar } from './components/Sidebar/Sidebar';
import { TabBar } from './components/TabBar/TabBar';
import { PathBar } from './components/PathBar/PathBar';
import { Homepage } from './components/Homepage/Homepage';
import { useBoardStore, selectActiveBoard } from './store/boardStore';
import { useUIStore } from './store/uiStore';
import { useApiSync } from './utils/apiSync';

function App() {
  useApiSync();
  const { deleteNote } = useBoardStore();
  const activeBoard = useBoardStore(selectActiveBoard);
  const { selectedNoteIds, setSelectedNoteIds, currentView } = useUIStore();
  const [sidebarWidth, setSidebarWidth] = useState(240);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Delete' || e.key === 'Backspace') {
        const target = e.target as HTMLElement;
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;
        if (selectedNoteIds.length > 0) {
          selectedNoteIds.forEach((id) => deleteNote(id));
          setSelectedNoteIds([]);
        }
      }
      if (e.key === 'Escape') {
        setSelectedNoteIds([]);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedNoteIds, deleteNote, setSelectedNoteIds]);

  return (
    <div style={{ width: '100vw', height: '100vh', overflow: 'hidden', display: 'flex' }}>
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
