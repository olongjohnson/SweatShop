import React, { useState, useEffect } from 'react';
import AgentTabBar from './AgentTabBar';
import logoUrl from '../icon.png';
import type { AgentStatus } from '../../shared/types';

type AppView = 'dashboard' | 'stories' | 'analytics' | 'settings';

interface AgentTab {
  id: string;
  name: string;
  status: AgentStatus;
}

interface OrgStatus {
  total: number;
  available: number;
  leased: number;
  expired: number;
}

interface TitleBarProps {
  agents: AgentTab[];
  activeAgentId: string;
  onSelectAgent: (id: string) => void;
  onAddAgent: () => void;
  onCloseAgent: (id: string) => void;
  activeView: AppView;
  onNavigate: (view: AppView) => void;
}

export default function TitleBar({ agents, activeAgentId, onSelectAgent, onAddAgent, onCloseAgent, activeView, onNavigate }: TitleBarProps) {
  const [orgStatus, setOrgStatus] = useState<OrgStatus | null>(null);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const status = await window.sweatshop.orgs.getStatus();
        if (mounted) setOrgStatus(status);
      } catch { /* org pool not initialized yet */ }
    };
    load();
    const interval = setInterval(load, 10000);
    return () => { mounted = false; clearInterval(interval); };
  }, []);

  return (
    <div className="titlebar">
      <div className="titlebar-brand" onClick={() => onNavigate('dashboard')} style={{ cursor: 'pointer' }}>
        <img src={logoUrl} alt="SweatShop" />
        <span>SweatShop</span>
      </div>
      <div className="titlebar-center">
        <AgentTabBar
          agents={agents}
          activeAgentId={activeAgentId}
          onSelectAgent={(id) => { onSelectAgent(id); onNavigate('dashboard'); }}
          onAddAgent={onAddAgent}
          onCloseAgent={onCloseAgent}
        />
      </div>
      {orgStatus && orgStatus.total > 0 && (
        <div className="org-pool-indicator" title={`${orgStatus.available} available, ${orgStatus.leased} leased, ${orgStatus.expired} expired`}>
          <span className="org-pool-dot" />
          <span className="org-pool-label">Orgs</span>
          <span className="org-pool-count">{orgStatus.available}/{orgStatus.total}</span>
        </div>
      )}
      <div className="titlebar-actions">
        <button
          title="Stories"
          className={activeView === 'stories' ? 'active' : ''}
          onClick={() => onNavigate(activeView === 'stories' ? 'dashboard' : 'stories')}
        >
          Stories
        </button>
        <button
          title="Analytics"
          className={activeView === 'analytics' ? 'active' : ''}
          onClick={() => onNavigate(activeView === 'analytics' ? 'dashboard' : 'analytics')}
        >
          Analytics
        </button>
        <button
          title="Settings"
          className={activeView === 'settings' ? 'active' : ''}
          onClick={() => onNavigate(activeView === 'settings' ? 'dashboard' : 'settings')}
        >
          Settings
        </button>
      </div>
    </div>
  );
}
