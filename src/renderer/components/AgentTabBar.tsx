import React from 'react';

interface Agent {
  id: string;
  name: string;
  status: 'developing' | 'needs-input' | 'idle';
}

interface AgentTabBarProps {
  agents: Agent[];
  activeAgentId: string;
  onSelectAgent: (id: string) => void;
}

export default function AgentTabBar({ agents, activeAgentId, onSelectAgent }: AgentTabBarProps) {
  return (
    <div className="agent-tabs">
      {agents.map((agent) => (
        <button
          key={agent.id}
          className={`agent-tab ${agent.id === activeAgentId ? 'active' : ''}`}
          onClick={() => onSelectAgent(agent.id)}
        >
          <span className={`agent-tab-status ${agent.status}`} />
          {agent.name}
          {agent.status === 'needs-input' && (
            <span className="agent-tab-badge">●</span>
          )}
        </button>
      ))}
      <button className="agent-tab-add" title="Add agent">+</button>
    </div>
  );
}
