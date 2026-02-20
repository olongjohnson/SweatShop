import React, { useState, useCallback, useRef, useEffect } from 'react';
import TitleBar from './components/TitleBar';
import Sidebar from './components/Sidebar';
import ResizableDivider from './components/ResizableDivider';
import BrowserPane from './components/BrowserPane';
import DiffView from './components/DiffView';
import ProvisioningPane from './components/ProvisioningPane';
import NotificationSystem from './components/NotificationSystem';
import StoriesView from './views/StoriesView';
import AnalyticsView from './views/AnalyticsView';
import SettingsView from './views/SettingsView';
import type { AgentStatus, OrchestratorStatus } from '../shared/types';

type AppView = 'dashboard' | 'stories' | 'analytics' | 'settings';

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
  const [contentTab, setContentTab] = useState<'browser' | 'diff' | 'provision'>('browser');
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
      // Auto-switch to diff tab when agent reaches QA_READY
      if (data.status === 'QA_READY' && data.agentId === activeAgentId) {
        setContentTab('diff');
      }
    });
  }, [activeAgentId]);

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
      if (e.ctrlKey && !e.shiftKey && e.key >= '1' && e.key <= '9') {
        e.preventDefault();
        const idx = parseInt(e.key) - 1;
        if (agents[idx]) {
          setActiveAgentId(agents[idx].id);
          setView('dashboard');
        }
        return;
      }

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

      if (e.ctrlKey && e.shiftKey && e.key === 'A') {
        e.preventDefault();
        const current = agents.find((a) => a.id === activeAgentId);
        if (current?.status === 'QA_READY') {
          const confirmed = window.confirm(
            'This will merge the agent\'s work into the base branch. Are you sure?'
          );
          if (confirmed) {
            window.sweatshop.agents.approve(activeAgentId);
          }
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

  const handleCloseAgent = useCallback(async (id: string) => {
    await window.sweatshop.agents.delete(id);
    setAgents((prev) => {
      const remaining = prev.filter((a) => a.id !== id);
      if (activeAgentId === id) {
        setActiveAgentId(remaining.length > 0 ? remaining[0].id : '');
      }
      return remaining;
    });
  }, [activeAgentId]);

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

  const activeAgent = agents.find((a) => a.id === activeAgentId);
  const showDiffTab = activeAgent && (
    activeAgent.status === 'QA_READY' ||
    activeAgent.status === 'APPROVED' ||
    activeAgent.status === 'MERGED'
  );

  const handleProvisionComplete = useCallback((loginUrl?: string) => {
    if (loginUrl && activeAgentId) {
      window.sweatshop.browser.loadURL(activeAgentId, loginUrl);
      setContentTab('browser');
    }
  }, [activeAgentId]);

  const renderContentPane = () => {
    if (contentTab === 'diff' && activeAgentId) {
      return <DiffView agentId={activeAgentId} />;
    }
    if (contentTab === 'provision') {
      return <ProvisioningPane onComplete={handleProvisionComplete} />;
    }
    return <BrowserPane agentId={activeAgentId} />;
  };

  const renderBody = () => {
    switch (view) {
      case 'stories':
        return (
          <div className="app-body">
            <StoriesView />
          </div>
        );
      case 'analytics':
        return (
          <div className="app-body">
            <AnalyticsView />
          </div>
        );
      case 'settings':
        return (
          <div className="app-body">
            <SettingsView />
          </div>
        );
      default:
        return (
          <div className="app-body" ref={bodyRef}>
            <div style={{ width: sidebarWidth, flexShrink: 0, display: 'flex' }}>
              <Sidebar agentId={activeAgentId} />
            </div>
            <ResizableDivider direction="vertical" onResize={handleSidebarResize} />
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
              <div className="content-pane-tabs">
                <button
                  className={`content-pane-tab ${contentTab === 'browser' ? 'active' : ''}`}
                  onClick={() => setContentTab('browser')}
                >
                  Browser
                </button>
                {showDiffTab && (
                  <button
                    className={`content-pane-tab ${contentTab === 'diff' ? 'active' : ''}`}
                    onClick={() => setContentTab('diff')}
                  >
                    Review Changes
                  </button>
                )}
                <button
                  className={`content-pane-tab ${contentTab === 'provision' ? 'active' : ''}`}
                  onClick={() => setContentTab('provision')}
                >
                  Provision Org
                </button>
              </div>
              {renderContentPane()}
            </div>
          </div>
        );
    }
  };

  return (
    <div className="app">
      <TitleBar
        agents={agents}
        activeAgentId={activeAgentId}
        onSelectAgent={handleSelectAgent}
        onAddAgent={handleAddAgent}
        onCloseAgent={handleCloseAgent}
        activeView={view}
        onNavigate={setView}
      />
      {renderBody()}

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
              <button className="btn-secondary" onClick={() => { setCompletionSummary(null); setView('analytics'); }}>
                View Analytics
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
