import type { ConscriptStatus } from '../../shared/types';

const VALID_TRANSITIONS: Record<ConscriptStatus, ConscriptStatus[]> = {
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

export function canTransition(current: ConscriptStatus, next: ConscriptStatus): boolean {
  return VALID_TRANSITIONS[current]?.includes(next) ?? false;
}

export function assertTransition(current: ConscriptStatus, next: ConscriptStatus): void {
  if (!canTransition(current, next)) {
    throw new Error(`Invalid conscript state transition: ${current} → ${next}`);
  }
}

/** States that require human attention */
export function isInterruptState(status: ConscriptStatus): boolean {
  return status === 'QA_READY' || status === 'NEEDS_INPUT' || status === 'ERROR';
}

/** States where the conscript is actively working */
export function isActiveState(status: ConscriptStatus): boolean {
  return status === 'DEVELOPING' || status === 'PROVISIONING' || status === 'BRANCHING' || status === 'REWORK';
}
