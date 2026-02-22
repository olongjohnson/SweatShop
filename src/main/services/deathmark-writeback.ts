/**
 * Deathmarch Write-Back Service
 *
 * Pushes agent session performance data back to the Deathmarch Salesforce org.
 * All functions are fire-and-forget — errors are logged but never block agent execution.
 * Only writes back for directives with source === 'deathmark' and an externalId.
 */

import { ensureConnection } from './deathmark';
import { getSettings } from './settings';
import * as dbService from './database';
import type { DirectiveRun, InterventionEvent, Directive } from '../../shared/types';

const NS = 'Cognito__';

// In-memory cache: SweatShop run UUID → Salesforce Agent_Session__c record Id
const sessionIdCache = new Map<string, string>();

// ===== Guards =====

function isConfigured(): boolean {
  const settings = getSettings();
  return !!settings.deathmark?.instanceUrl;
}

function isDeathmarkDirective(directive: Directive | null): directive is Directive {
  return !!directive && directive.source === 'deathmark' && !!directive.externalId;
}

async function guarded(
  directiveId: string,
  fn: (directive: Directive) => Promise<void>,
): Promise<void> {
  if (!isConfigured()) return;

  const directive = dbService.getDirective(directiveId);
  if (!isDeathmarkDirective(directive)) return;

  try {
    await fn(directive);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[DeathmarkWriteback] Write-back failed for directive ${directiveId}: ${msg}`);
  }
}

// ===== Value Mappers =====

function mapRunStatus(status: DirectiveRun['status']): string {
  switch (status) {
    case 'running': return 'Running';
    case 'completed': return 'Completed';
    case 'failed': return 'Failed';
    case 'cancelled': return 'Cancelled';
    default: return 'Running';
  }
}

function mapEventType(type: InterventionEvent['type']): string {
  switch (type) {
    case 'question': return 'Question';
    case 'rework': return 'Rework';
    case 'guidance': return 'Guidance';
    case 'error_recovery': return 'Error Recovery';
    default: return 'Question';
  }
}

// ===== Core Operations =====

async function updateTicketStatus(
  externalId: string,
  agentStatus: string,
  opts?: { returnReason?: string; clearReturnReason?: boolean },
): Promise<void> {
  const conn = await ensureConnection();
  const settings = getSettings();
  const objectName = settings.deathmark?.objectName || 'Cognito__Ticket__c';

  const data: Record<string, unknown> = {
    Id: externalId,
    [`${NS}Agent_Status__c`]: agentStatus,
  };

  if (opts?.returnReason) {
    data[`${NS}Agent_Return_Reason__c`] = opts.returnReason.slice(0, 32768);
  } else if (opts?.clearReturnReason) {
    data[`${NS}Agent_Return_Reason__c`] = '';
  }

  await conn.sobject(objectName).update(data);
}

async function upsertSession(
  run: DirectiveRun,
  directive: Directive,
  conscriptName: string,
  sessionOrder?: number,
): Promise<void> {
  const conn = await ensureConnection();

  const data: Record<string, unknown> = {
    [`${NS}External_Run_Id__c`]: run.id,
    [`${NS}Ticket__c`]: directive.externalId,
    [`${NS}Status__c`]: mapRunStatus(run.status),
    [`${NS}Agent_Name__c`]: conscriptName,
    [`${NS}Camp_Alias__c`]: run.campAlias || '',
    [`${NS}Branch_Name__c`]: run.branchName || '',
    [`${NS}Started_At__c`]: run.startedAt,
    [`${NS}Completed_At__c`]: run.completedAt || null,
    [`${NS}Intervention_Count__c`]: run.humanInterventionCount,
    [`${NS}Rework_Count__c`]: run.reworkCount,
    [`${NS}Prompt_Tokens__c`]: run.promptTokensUsed,
    [`${NS}Completion_Tokens__c`]: run.completionTokensUsed,
  };

  if (sessionOrder !== undefined) {
    data[`${NS}Session_Order__c`] = sessionOrder;
  }

  const result = await conn
    .sobject(`${NS}Agent_Session__c`)
    .upsert(data, `${NS}External_Run_Id__c`);

  if (result.id) {
    sessionIdCache.set(run.id, result.id);
  }
}

async function resolveSessionId(runId: string): Promise<string | null> {
  const cached = sessionIdCache.get(runId);
  if (cached) return cached;

  const conn = await ensureConnection();
  const result = await conn.query<{ Id: string }>(
    `SELECT Id FROM ${NS}Agent_Session__c WHERE ${NS}External_Run_Id__c = '${runId}' LIMIT 1`,
  );

  if (result.records.length > 0) {
    const id = result.records[0].Id;
    sessionIdCache.set(runId, id);
    return id;
  }

  return null;
}

async function insertEvent(
  runId: string,
  event: InterventionEvent,
  eventOrder: number,
): Promise<void> {
  const sessionId = await resolveSessionId(runId);
  if (!sessionId) {
    console.warn(`[DeathmarkWriteback] No SF session found for run ${runId}, skipping event insert`);
    return;
  }

  const conn = await ensureConnection();
  await conn.sobject(`${NS}Agent_Event__c`).create({
    [`${NS}Agent_Session__c`]: sessionId,
    [`${NS}Event_Type__c`]: mapEventType(event.type),
    [`${NS}Agent_Message__c`]: (event.conscriptMessage || '').slice(0, 32768),
    [`${NS}Human_Response__c`]: (event.humanResponse || '').slice(0, 32768),
    [`${NS}Wait_Duration_Ms__c`]: event.waitDurationMs,
    [`${NS}Timestamp__c`]: event.timestamp,
    [`${NS}Event_Order__c`]: eventOrder,
  });
}

// ===== Lifecycle Hooks =====

/** Insert a final "Error Recovery" event explaining why the agent returned/failed */
async function insertReturnEvent(runId: string, reason: string): Promise<void> {
  const sessionId = await resolveSessionId(runId);
  if (!sessionId) return;

  const run = dbService.getRun(runId);
  const eventOrder = run ? run.humanInterventionCount : 0;

  const conn = await ensureConnection();
  await conn.sobject(`${NS}Agent_Event__c`).create({
    [`${NS}Agent_Session__c`]: sessionId,
    [`${NS}Event_Type__c`]: 'Error Recovery',
    [`${NS}Agent_Message__c`]: reason.slice(0, 32768),
    [`${NS}Timestamp__c`]: new Date().toISOString(),
    [`${NS}Event_Order__c`]: eventOrder,
  });
}

/** Called when a directive is assigned to a conscript (IDLE → ASSIGNED) */
export async function onAssigned(directiveId: string): Promise<void> {
  await guarded(directiveId, async (directive) => {
    await updateTicketStatus(directive.externalId!, 'Assigned', { clearReturnReason: true });
  });
}

/** Called when the conscript starts developing (BRANCHING → DEVELOPING) */
export async function onDevelopmentStarted(directiveId: string, runId: string): Promise<void> {
  await guarded(directiveId, async (directive) => {
    await updateTicketStatus(directive.externalId!, 'In Progress');

    const run = dbService.getRun(runId);
    const conscript = run ? dbService.getConscript(run.conscriptId) : null;
    if (run && conscript) {
      const existingRuns = dbService.listRuns(directiveId);
      const sessionOrder = existingRuns.findIndex((r) => r.id === runId);
      await upsertSession(run, directive, conscript.name, sessionOrder >= 0 ? sessionOrder : 0);
    }
  });
}

/** Called when conscript reaches QA_READY */
export async function onQAReady(directiveId: string, runId: string): Promise<void> {
  await guarded(directiveId, async (directive) => {
    await updateTicketStatus(directive.externalId!, 'QA Review');

    const run = dbService.getRun(runId);
    const conscript = run ? dbService.getConscript(run.conscriptId) : null;
    if (run && conscript) {
      await upsertSession(run, directive, conscript.name);
    }
  });
}

/** Called when human approves and work is merged */
export async function onWorkApproved(directiveId: string, runId: string): Promise<void> {
  await guarded(directiveId, async (directive) => {
    await updateTicketStatus(directive.externalId!, 'Completed');

    const run = dbService.getRun(runId);
    const conscript = run ? dbService.getConscript(run.conscriptId) : null;
    if (run && conscript) {
      await upsertSession(run, directive, conscript.name);
    }
  });
}

/** Called when agent errors or work is scrapped */
export async function onWorkFailed(directiveId: string, runId: string, reason?: string): Promise<void> {
  await guarded(directiveId, async (directive) => {
    await updateTicketStatus(directive.externalId!, 'Failed', { returnReason: reason });

    const run = dbService.getRun(runId);
    const conscript = run ? dbService.getConscript(run.conscriptId) : null;
    if (run && conscript) {
      await upsertSession(run, directive, conscript.name);
    }
    if (reason) {
      await insertReturnEvent(runId, reason);
    }
  });
}

/** Called when conscript is stopped (returned to human) */
export async function onWorkReturned(directiveId: string, runId: string, reason?: string): Promise<void> {
  await guarded(directiveId, async (directive) => {
    await updateTicketStatus(directive.externalId!, 'Returned', { returnReason: reason });

    const run = dbService.getRun(runId);
    const conscript = run ? dbService.getConscript(run.conscriptId) : null;
    if (run && conscript) {
      await upsertSession(run, directive, conscript.name);
    }
    if (reason) {
      await insertReturnEvent(runId, reason);
    }
  });
}

/** Called after QA rejection (REWORK) */
export async function onReworkRequested(directiveId: string, runId: string): Promise<void> {
  await guarded(directiveId, async (directive) => {
    await updateTicketStatus(directive.externalId!, 'In Progress');

    const run = dbService.getRun(runId);
    const conscript = run ? dbService.getConscript(run.conscriptId) : null;
    if (run && conscript) {
      await upsertSession(run, directive, conscript.name);
    }
  });
}

/** Called after a human intervention is recorded in the DB */
export async function onIntervention(
  runId: string,
  event: InterventionEvent,
  eventOrder: number,
): Promise<void> {
  const run = dbService.getRun(runId);
  if (!run) return;

  await guarded(run.directiveId, async (directive) => {
    const conscript = dbService.getConscript(run.conscriptId);
    if (conscript) {
      await upsertSession(run, directive, conscript.name);
    }
    await insertEvent(runId, event, eventOrder);
  });
}
