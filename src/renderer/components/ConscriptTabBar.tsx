import React from 'react';
import type { ConscriptStatus } from '../../shared/types';

interface ConscriptTab {
  id: string;
  name: string;
  status: ConscriptStatus;
}

interface ConscriptTabBarProps {
  conscripts: ConscriptTab[];
  activeConscriptId: string;
  onSelectConscript: (id: string) => void;
  onAddConscript: () => void;
  onCloseConscript: (id: string) => void;
}

function statusClass(status: ConscriptStatus): string {
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

function hasBadge(status: ConscriptStatus): boolean {
  return status === 'QA_READY' || status === 'NEEDS_INPUT' || status === 'ERROR';
}

export default function ConscriptTabBar({ conscripts, activeConscriptId, onSelectConscript, onAddConscript, onCloseConscript }: ConscriptTabBarProps) {
  return (
    <div className="agent-tabs">
      {conscripts.map((conscript) => (
        <div
          key={conscript.id}
          className={`agent-tab ${conscript.id === activeConscriptId ? 'active' : ''}`}
          onClick={() => onSelectConscript(conscript.id)}
          title={`${conscript.name} — ${conscript.status}`}
        >
          <span className={`agent-tab-status ${statusClass(conscript.status)}`} />
          {conscript.name}
          {hasBadge(conscript.status) && (
            <span className={`agent-tab-badge ${statusClass(conscript.status)}`}>
              {'\u25CF'}
            </span>
          )}
          <span
            className="agent-tab-close"
            onClick={(e) => {
              e.stopPropagation();
              onCloseConscript(conscript.id);
            }}
            title="Close conscript"
          >
            &times;
          </span>
        </div>
      ))}
      <button className="agent-tab-add" title="Add conscript" onClick={onAddConscript}>+</button>
    </div>
  );
}
