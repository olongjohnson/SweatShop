import React, { useState, useCallback, useRef } from 'react';
import TitleBar from './components/TitleBar';
import Sidebar from './components/Sidebar';
import ResizableDivider from './components/ResizableDivider';
import BrowserPane from './components/BrowserPane';
import StoriesView from './views/StoriesView';

type AppView = 'dashboard' | 'stories';

const MOCK_AGENTS = [
  { id: 'agent-1', name: 'Agent 1', status: 'developing' as const },
  { id: 'agent-2', name: 'Agent 2', status: 'needs-input' as const },
  { id: 'agent-3', name: 'Agent 3', status: 'idle' as const },
];

export default function App() {
  const [activeAgentId, setActiveAgentId] = useState('agent-1');
  const [sidebarWidth, setSidebarWidth] = useState(350);
  const [view, setView] = useState<AppView>('dashboard');
  const bodyRef = useRef<HTMLDivElement>(null);

  const handleSidebarResize = useCallback((delta: number) => {
    setSidebarWidth((prev) => {
      if (!bodyRef.current) return prev;
      const maxWidth = bodyRef.current.getBoundingClientRect().width * 0.5;
      return Math.max(250, Math.min(maxWidth, prev + delta));
    });
  }, []);

  return (
    <div className="app">
      <TitleBar
        agents={MOCK_AGENTS}
        activeAgentId={activeAgentId}
        onSelectAgent={setActiveAgentId}
        activeView={view}
        onNavigate={setView}
      />
      {view === 'dashboard' ? (
        <div className="app-body" ref={bodyRef}>
          <div style={{ width: sidebarWidth, flexShrink: 0, display: 'flex' }}>
            <Sidebar agentId={activeAgentId} />
          </div>
          <ResizableDivider direction="vertical" onResize={handleSidebarResize} />
          <BrowserPane agentId={activeAgentId} />
        </div>
      ) : (
        <div className="app-body">
          <StoriesView />
        </div>
      )}
    </div>
  );
}
