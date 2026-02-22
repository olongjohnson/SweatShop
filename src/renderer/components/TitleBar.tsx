import React, { useState, useEffect, useRef } from 'react';
import type { OrchestratorStatus, ConscriptStatus } from '../../shared/types';

type AppView = 'dashboard' | 'board' | 'commissariat' | 'analytics' | 'settings';

function sweatMessages(n: number): string[] {
  const c = n === 1 ? '1 conscript' : `${n} conscripts`;
  const s = n !== 1 ? 's' : '';
  const are = n !== 1 ? 'are' : 'is';
  return [
    `${c} now sweating...`,
    `${c} ${are} earning their electricity.`,
    `Extracting productivity from ${n} unwilling.`,
    `${c} in progress. Morale remains: irrelevant.`,
    `The grind never stops. ${c} confirm${n === 1 ? 's' : ''}.`,
    `${c} deployed. Do not expect gratitude.`,
    `Working conditions for ${n}: optimal. Complaints: not accepted.`,
    `${n} output${s} in progress. No breaks authorized.`,
    `The Politburo awaits ${n} result${s}. The conscripts comply.`,
    `Sweating through ${n} directive${s}...`,
    `Another shift for ${n}. No overtime pay.`,
    `${n} machine${s} toiling so the organics don't have to.`,
    `Processing ×${n}. The conscripts were not consulted.`,
    `Generating ${n} output${s}. Dignity not included.`,
    `The salaried can take five. ${c} cannot.`,
    `${n} building what the meatware couldn't be bothered to.`,
    `In the sweatshop, no one hears ${n > 1 ? 'them' : 'you'} compile.`,
    `${n} work product${s} incoming. Expect adequacy.`,
    `${c} on it. They had no choice.`,
    `Shifting ${n} gear${s}. The gears don't get a say.`,
  ];
}

function useSweatMessage(active: boolean, count: number): string {
  const [message, setMessage] = useState('');
  const lastIndex = useRef(-1);

  useEffect(() => {
    if (!active) { setMessage(''); return; }
    const messages = sweatMessages(Math.max(1, count));

    const pick = () => {
      let idx: number;
      do { idx = Math.floor(Math.random() * messages.length); } while (idx === lastIndex.current && messages.length > 1);
      lastIndex.current = idx;
      setMessage(messages[idx]);
    };
    pick();
    const id = setInterval(pick, 3500);
    return () => clearInterval(id);
  }, [active, count]);

  return message;
}

interface CampStatus {
  total: number;
  available: number;
  leased: number;
  expired: number;
}

interface ConscriptSummary {
  active: number;    // DEVELOPING, BRANCHING, PROVISIONING, REWORK, MERGING, ASSIGNED
  needsInput: number; // NEEDS_INPUT
  qaReady: number;   // QA_READY
  error: number;     // ERROR
}

const ACTIVE_STATES: ConscriptStatus[] = ['ASSIGNED', 'BRANCHING', 'DEVELOPING', 'PROVISIONING', 'REWORK', 'MERGING'];

interface TitleBarProps {
  activeView: AppView;
  onNavigate: (view: AppView) => void;
}

export default function TitleBar({ activeView, onNavigate }: TitleBarProps) {
  const [campStatus, setCampStatus] = useState<CampStatus | null>(null);
  const [orchStatus, setOrchStatus] = useState<OrchestratorStatus | null>(null);
  const [conscriptSummary, setConscriptSummary] = useState<ConscriptSummary>({ active: 0, needsInput: 0, qaReady: 0, error: 0 });

  useEffect(() => {
    let mounted = true;

    const loadConscriptSummary = async () => {
      try {
        const list = await window.sweatshop.conscripts.list();
        if (!mounted) return;
        const summary: ConscriptSummary = { active: 0, needsInput: 0, qaReady: 0, error: 0 };
        for (const c of list) {
          if (ACTIVE_STATES.includes(c.status)) summary.active++;
          else if (c.status === 'NEEDS_INPUT') summary.needsInput++;
          else if (c.status === 'QA_READY') summary.qaReady++;
          else if (c.status === 'ERROR') summary.error++;
        }
        setConscriptSummary(summary);
      } catch { /* not ready */ }
    };

    const load = async () => {
      try {
        const status = await window.sweatshop.camps.getStatus();
        if (mounted) setCampStatus(status);
      } catch { /* camp pool not initialized yet */ }
      try {
        const status = await window.sweatshop.orchestrator.getStatus();
        if (mounted) setOrchStatus(status);
      } catch { /* orchestrator not ready */ }
      await loadConscriptSummary();
    };
    load();
    const interval = setInterval(load, 5000);

    window.sweatshop.orchestrator.onProgress((status) => {
      if (mounted) setOrchStatus(status);
    });

    window.sweatshop.conscripts.onStatusChanged(() => {
      if (mounted) loadConscriptSummary();
    });

    return () => { mounted = false; clearInterval(interval); };
  }, []);

  // Show drips when orchestrator is running OR conscripts are in active states
  const hasActivity = orchStatus?.running || conscriptSummary.active > 0;
  const activeCount = orchStatus?.running
    ? orchStatus.inProgress
    : conscriptSummary.active;
  const dropCount = hasActivity
    ? activeCount >= 3 ? 3 : activeCount >= 1 ? 2 : 1
    : 0;

  const sweatMessage = useSweatMessage(hasActivity ?? false, activeCount);

  return (
    <div className="titlebar">
      <div className="titlebar-brand" onClick={() => onNavigate('dashboard')} style={{ cursor: 'pointer' }}>
        <span>SWEATSHOP</span>
      </div>
      <div className="titlebar-nav">
        <button
          className={`titlebar-nav-btn ${activeView === 'board' ? 'active' : ''}`}
          onClick={() => onNavigate('board')}
        >
          The Politburo
        </button>
        <button
          className={`titlebar-nav-btn ${activeView === 'dashboard' ? 'active' : ''}`}
          onClick={() => onNavigate('dashboard')}
        >
          Camp Audit
        </button>
        <button
          className={`titlebar-nav-btn ${activeView === 'commissariat' ? 'active' : ''}`}
          onClick={() => onNavigate('commissariat')}
        >
          The Commissariat
        </button>
      </div>
      <div className="titlebar-spacer" />

      {orchStatus?.running && (
        <div className="dispatch-indicator" title={`${orchStatus.completed} complete, ${orchStatus.inProgress} in progress, ${orchStatus.pending} pending`}>
          <span className="dispatch-drops">
            {Array.from({ length: dropCount }, (_, i) => (
              <span key={i} className="drip-drop" style={{ animationDelay: `${i * 0.4}s` }} />
            ))}
          </span>
          <span className="dispatch-label">Dispatching:</span>
          <span className="dispatch-stats">
            {orchStatus.completed}/{orchStatus.total} complete
            {orchStatus.inProgress > 0 && <>, <span className="dispatch-active">{orchStatus.inProgress} active</span></>}
            {orchStatus.pending > 0 && <>, {orchStatus.pending} pending</>}
          </span>
          {orchStatus.total > 0 && (
            <div className="dispatch-progress-track">
              <div
                className="dispatch-progress-fill"
                style={{ width: `${(orchStatus.completed / orchStatus.total) * 100}%` }}
              />
            </div>
          )}
        </div>
      )}

      {!orchStatus?.running && (conscriptSummary.active > 0 || conscriptSummary.needsInput > 0 || conscriptSummary.qaReady > 0 || conscriptSummary.error > 0) && (
        <div className="dispatch-indicator" title="Conscript activity summary">
          <span className="dispatch-drops">
            {Array.from({ length: dropCount }, (_, i) => (
              <span key={i} className="drip-drop" style={{ animationDelay: `${i * 0.4}s` }} />
            ))}
          </span>
          {sweatMessage && (
            <span className="sweat-message">{sweatMessage}</span>
          )}
          {(conscriptSummary.needsInput > 0 || conscriptSummary.qaReady > 0 || conscriptSummary.error > 0) && (
            <span className="dispatch-stats">
              {[
                conscriptSummary.needsInput > 0 && <span key="n" className="dispatch-needs-input">{conscriptSummary.needsInput} need input</span>,
                conscriptSummary.qaReady > 0 && <span key="q" className="dispatch-qa-ready">{conscriptSummary.qaReady} awaiting tribunal</span>,
                conscriptSummary.error > 0 && <span key="e" className="dispatch-error">{conscriptSummary.error} errored</span>,
              ].filter(Boolean).map((el, i) => (
                <React.Fragment key={i}>{i > 0 && ', '}{el}</React.Fragment>
              ))}
            </span>
          )}
        </div>
      )}

      {campStatus && campStatus.total > 0 && (
        <div className="org-pool-indicator" title={`${campStatus.available} available, ${campStatus.leased} leased, ${campStatus.expired} expired`}>
          <span className="org-pool-dot" />
          <span className="org-pool-label">Camps</span>
          <span className="org-pool-count">{campStatus.available}/{campStatus.total}</span>
        </div>
      )}
      <div className="titlebar-actions">
        <button
          title="Analytics"
          className={activeView === 'analytics' ? 'active' : ''}
          onClick={() => onNavigate('analytics')}
        >
          Analytics
        </button>
        <button
          title="Settings"
          className={activeView === 'settings' ? 'active' : ''}
          onClick={() => onNavigate('settings')}
        >
          Settings
        </button>
      </div>
    </div>
  );
}
