import React, { useState, useCallback, useRef, useEffect } from 'react';
import TitleBar from './components/TitleBar';
import Sidebar from './components/Sidebar';
import ResizableDivider from './components/ResizableDivider';
import BrowserPane from './components/BrowserPane';
import NotificationSystem from './components/NotificationSystem';
import StoriesView from './views/StoriesView';
import type { AgentStatus, OrchestratorStatus } from '../shared/types';

type AppView = 'dashboard' | 'stories';

interface AgentTab {
  id: string;
  name: string;
  status: AgentStatus;
}

export default function App() {
  const [agents, setAgents] = useState<AgentTab[]>([]);
  const [activeAgentId, setActiveAgentId] = useState<string>('');
  const [sidebarWidth, setSidebarWidth] = useState(350);
  const [view, setView] = useState<AppView>('dashboard');
  const [completionSummary, setCompletionSummary] = useState<OrchestratorStatus | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  // Load agents from DB on mount
  useEffect(() => {
    const load = async () => {
      const dbAgents = await window.sweatshop.agents.list();
      const tabs: AgentTab[] = dbAgents.map((a) => ({
        id: a.id,
        name: a.name,
        status: a.status,
      }));
      setAgents(tabs);
      if (tabs.length > 0 && !activeAgentId) {
        setActiveAgentId(tabs[0].id);
      }
    };
    load();
  }, []);

  // Subscribe to agent status changes
  useEffect(() => {
    window.sweatshop.agents.onStatusChanged((data) => {
      setAgents((prev) =>
        prev.map((a) =>
          a.id === data.agentId ? { ...a, status: data.status } : a
        )
      );
    });
  }, []);

  // Subscribe to orchestrator completion
  useEffect(() => {
    window.sweatshop.orchestrator.onProgress((status) => {
      if (status.completed === status.total && status.total > 0 && !status.running) {
        setCompletionSummary(status);
      }
    });
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Ctrl+1 through Ctrl+9: switch agent tabs
      if (e.ctrlKey && !e.shiftKey && e.key >= '1' && e.key <= '9') {
        e.preventDefault();
        const idx = parseInt(e.key) - 1;
        if (agents[idx]) {
          setActiveAgentId(agents[idx].id);
          setView('dashboard');
        }
        return;
      }

      // Ctrl+N: jump to next agent needing input
      if (e.ctrlKey && !e.shiftKey && e.key === 'n') {
        e.preventDefault();
        const needsAttention = agents.find(
          (a) => a.status === 'QA_READY' || a.status === 'NEEDS_INPUT'
        );
        if (needsAttention) {
          setActiveAgentId(needsAttention.id);
          setView('dashboard');
        }
        return;
      }

      // Ctrl+Shift+N: jump to next agent with any notification
      if (e.ctrlKey && e.shiftKey && e.key === 'N') {
        e.preventDefault();
        const hasNotif = agents.find(
          (a) => a.status === 'QA_READY' || a.status === 'NEEDS_INPUT' || a.status === 'ERROR'
        );
        if (hasNotif) {
          setActiveAgentId(hasNotif.id);
          setView('dashboard');
        }
        return;
      }

      // Ctrl+Shift+A: approve current agent
      if (e.ctrlKey && e.shiftKey && e.key === 'A') {
        e.preventDefault();
        const current = agents.find((a) => a.id === activeAgentId);
        if (current?.status === 'QA_READY') {
          window.sweatshop.agents.approve(activeAgentId);
        }
        return;
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [agents, activeAgentId]);

  const handleAddAgent = useCallback(async () => {
    const name = `Agent ${agents.length + 1}`;
    const agent = await window.sweatshop.agents.create({ name });
    setAgents((prev) => [...prev, { id: agent.id, name: agent.name, status: agent.status }]);
    setActiveAgentId(agent.id);
    setView('dashboard');
  }, [agents.length]);

  const handleSidebarResize = useCallback((delta: number) => {
    setSidebarWidth((prev) => {
      if (!bodyRef.current) return prev;
      const maxWidth = bodyRef.current.getBoundingClientRect().width * 0.5;
      return Math.max(250, Math.min(maxWidth, prev + delta));
    });
  }, []);

  const handleSelectAgent = useCallback((id: string) => {
    setActiveAgentId(id);
    setView('dashboard');
  }, []);

  return (
    <div className="app">
      <TitleBar
        agents={agents}
        activeAgentId={activeAgentId}
        onSelectAgent={handleSelectAgent}
        onAddAgent={handleAddAgent}
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

      <NotificationSystem onSelectAgent={handleSelectAgent} />

      {completionSummary && (
        <div className="completion-overlay">
          <div className="completion-card">
            <h2>All Work Complete!</h2>
            <div className="completion-stats">
              <div className="completion-stat">
                <span className="completion-stat-label">Tickets processed</span>
                <span className="completion-stat-value">{completionSummary.total}</span>
              </div>
              <div className="completion-stat">
                <span className="completion-stat-label">Completed</span>
                <span className="completion-stat-value">{completionSummary.completed}</span>
              </div>
            </div>
            <div className="completion-actions">
              <button className="btn-secondary" onClick={() => { setCompletionSummary(null); setView('stories'); }}>
                View Stories
              </button>
              <button className="btn-primary" onClick={() => setCompletionSummary(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
