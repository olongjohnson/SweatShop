import React from 'react';
import AgentTabBar from './AgentTabBar';
import logoUrl from '../icon.png';

interface Agent {
  id: string;
  name: string;
  status: 'developing' | 'needs-input' | 'idle';
}

interface TitleBarProps {
  agents: Agent[];
  activeAgentId: string;
  onSelectAgent: (id: string) => void;
}

export default function TitleBar({ agents, activeAgentId, onSelectAgent }: TitleBarProps) {
  return (
    <div className="titlebar">
      <div className="titlebar-brand">
        <img src={logoUrl} alt="SweatShop" />
        <span>SweatShop</span>
      </div>
      <div className="titlebar-center">
        <AgentTabBar
          agents={agents}
          activeAgentId={activeAgentId}
          onSelectAgent={onSelectAgent}
        />
      </div>
      <div className="titlebar-actions">
        <button title="Stories">&#x1F4CB;</button>
        <button title="Settings">&#x2699;</button>
      </div>
    </div>
  );
}
