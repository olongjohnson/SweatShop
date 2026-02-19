import React from 'react';
import AgentTabBar from './AgentTabBar';
import logoUrl from '../icon.png';

type AppView = 'dashboard' | 'stories';

interface Agent {
  id: string;
  name: string;
  status: 'developing' | 'needs-input' | 'idle';
}

interface TitleBarProps {
  agents: Agent[];
  activeAgentId: string;
  onSelectAgent: (id: string) => void;
  activeView: AppView;
  onNavigate: (view: AppView) => void;
}

export default function TitleBar({ agents, activeAgentId, onSelectAgent, activeView, onNavigate }: TitleBarProps) {
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
        />
      </div>
      <div className="titlebar-actions">
        <button
          title="Stories"
          className={activeView === 'stories' ? 'active' : ''}
          onClick={() => onNavigate(activeView === 'stories' ? 'dashboard' : 'stories')}
        >
          Stories
        </button>
        <button title="Settings">Settings</button>
      </div>
    </div>
  );
}
