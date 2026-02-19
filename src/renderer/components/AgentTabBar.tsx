import React from 'react';
import type { AgentStatus } from '../../shared/types';

interface AgentTab {
  id: string;
  name: string;
  status: AgentStatus;
}

interface AgentTabBarProps {
  agents: AgentTab[];
  activeAgentId: string;
  onSelectAgent: (id: string) => void;
  onAddAgent: () => void;
}

function statusClass(status: AgentStatus): string {
  switch (status) {
    case 'DEVELOPING':
    case 'PROVISIONING':
    case 'BRANCHING':
    case 'REWORK':
    case 'MERGING':
      return 'working';
    case 'NEEDS_INPUT':
      return 'needs-input';
    case 'QA_READY':
      return 'qa-ready';
    case 'ERROR':
      return 'error';
    case 'ASSIGNED':
      return 'assigned';
    case 'IDLE':
    default:
      return 'idle';
  }
}

function hasBadge(status: AgentStatus): boolean {
  return status === 'QA_READY' || status === 'NEEDS_INPUT' || status === 'ERROR';
}

export default function AgentTabBar({ agents, activeAgentId, onSelectAgent, onAddAgent }: AgentTabBarProps) {
  return (
    <div className="agent-tabs">
      {agents.map((agent) => (
        <button
          key={agent.id}
          className={`agent-tab ${agent.id === activeAgentId ? 'active' : ''}`}
          onClick={() => onSelectAgent(agent.id)}
          title={`${agent.name} — ${agent.status}`}
        >
          <span className={`agent-tab-status ${statusClass(agent.status)}`} />
          {agent.name}
          {hasBadge(agent.status) && (
            <span className={`agent-tab-badge ${statusClass(agent.status)}`}>
              {'\u25CF'}
            </span>
          )}
        </button>
      ))}
      <button className="agent-tab-add" title="Add agent" onClick={onAddAgent}>+</button>
    </div>
  );
}
