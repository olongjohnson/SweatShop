import React, { useState, useCallback, useEffect } from 'react';
import TitleBar from './components/TitleBar';
import CampAuditView from './components/CampAuditView';
import NotificationSystem from './components/NotificationSystem';
import BoardView from './views/BoardView';
import CommissariatView from './views/CommissariatView';
import AnalyticsView from './views/AnalyticsView';
import SettingsView from './views/SettingsView';
import type { OrchestratorStatus } from '../shared/types';

type AppView = 'dashboard' | 'board' | 'commissariat' | 'analytics' | 'settings';

export default function App() {
  const [view, setView] = useState<AppView>('board');
  const [completionSummary, setCompletionSummary] = useState<OrchestratorStatus | null>(null);
  const [inspectCampAlias, setInspectCampAlias] = useState<string | null>(null);
  const [focusConscriptId, setFocusConscriptId] = useState<string | undefined>(undefined);

  // Subscribe to conscript status changes — auto-navigate on QA_READY
  useEffect(() => {
    window.sweatshop.conscripts.onStatusChanged(async (data) => {
      if (data.status === 'QA_READY') {
        const conscript = await window.sweatshop.conscripts.get(data.conscriptId);
        if (conscript?.assignedCampAlias) {
          setInspectCampAlias(conscript.assignedCampAlias);
          setFocusConscriptId(data.conscriptId);
          setView('dashboard');
        }
      }
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

  const handleAddConscript = useCallback(async () => {
    const list = await window.sweatshop.conscripts.list();
    const name = `Conscript ${list.length + 1}`;
    await window.sweatshop.conscripts.create({ name });
  }, []);

  const handleCloseConscript = useCallback(async (id: string) => {
    await window.sweatshop.conscripts.delete(id);
  }, []);

  const handleInspectCamp = useCallback((alias: string) => {
    setInspectCampAlias(alias);
    setFocusConscriptId(undefined);
    setView('dashboard');
  }, []);

  const renderBody = () => {
    switch (view) {
      case 'board':
        return (
          <div className="app-body">
            <BoardView onInspectCamp={handleInspectCamp} onAddConscript={handleAddConscript} onCloseConscript={handleCloseConscript} />
          </div>
        );
      case 'commissariat':
        return (
          <div className="app-body">
            <CommissariatView />
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
          <div className="app-body">
            <CampAuditView
              selectedCampAlias={inspectCampAlias}
              onCampSelected={setInspectCampAlias}
              focusConscriptId={focusConscriptId}
            />
          </div>
        );
    }
  };

  return (
    <div className="app">
      <TitleBar
        activeView={view}
        onNavigate={setView}
      />
      {renderBody()}

      <NotificationSystem onSelectConscript={() => setView('dashboard')} />

      {completionSummary && (
        <div className="completion-overlay">
          <div className="completion-card">
            <h2>All Work Complete!</h2>
            <div className="completion-stats">
              <div className="completion-stat">
                <span className="completion-stat-label">Directives processed</span>
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
