import type { AgentStatus } from '../../shared/types';

const VALID_TRANSITIONS: Record<AgentStatus, AgentStatus[]> = {
  IDLE:         ['ASSIGNED'],
  ASSIGNED:     ['BRANCHING', 'ERROR'],
  BRANCHING:    ['DEVELOPING', 'ERROR'],
  DEVELOPING:   ['NEEDS_INPUT', 'PROVISIONING', 'QA_READY', 'ERROR'],
  NEEDS_INPUT:  ['DEVELOPING'],
  PROVISIONING: ['QA_READY', 'ERROR'],
  QA_READY:     ['MERGING', 'REWORK'],
  MERGING:      ['IDLE', 'ERROR'],
  REWORK:       ['DEVELOPING', 'ERROR'],
  ERROR:        ['IDLE', 'DEVELOPING', 'PROVISIONING'],
};

export function canTransition(current: AgentStatus, next: AgentStatus): boolean {
  return VALID_TRANSITIONS[current]?.includes(next) ?? false;
}

export function assertTransition(current: AgentStatus, next: AgentStatus): void {
  if (!canTransition(current, next)) {
    throw new Error(`Invalid agent state transition: ${current} → ${next}`);
  }
}

/** States that require human attention */
export function isInterruptState(status: AgentStatus): boolean {
  return status === 'QA_READY' || status === 'NEEDS_INPUT' || status === 'ERROR';
}

/** States where the agent is actively working */
export function isActiveState(status: AgentStatus): boolean {
  return status === 'DEVELOPING' || status === 'PROVISIONING' || status === 'BRANCHING' || status === 'REWORK';
}
