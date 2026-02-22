import Database from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';
import type {
  Directive, DirectiveStatus, Conscript, Camp, ChatMessage,
  DirectiveRun, InterventionEvent, RefinedPrompt,
  IdentityTemplate, WorkflowTemplate, PipelineRun,
} from '../../shared/types';

let db: Database.Database;

function uuid(): string {
  return crypto.randomUUID();
}

function now(): string {
  return new Date().toISOString();
}

// ===== Initialization =====

export function initDatabase(userDataPath: string): void {
  const dbDir = userDataPath;
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  const dbPath = path.join(dbDir, 'sweatshop.db');
  db = new Database(dbPath);

  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  createTables();
}

function createTables(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS directives (
      id TEXT PRIMARY KEY,
      external_id TEXT,
      source TEXT NOT NULL DEFAULT 'manual',
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      acceptance_criteria TEXT NOT NULL DEFAULT '',
      labels TEXT NOT NULL DEFAULT '[]',
      priority TEXT NOT NULL DEFAULT 'medium',
      status TEXT NOT NULL DEFAULT 'backlog',
      depends_on TEXT NOT NULL DEFAULT '[]',
      assigned_conscript_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS conscripts (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'IDLE',
      assigned_directive_id TEXT,
      assigned_camp_alias TEXT,
      branch_name TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS camps (
      id TEXT PRIMARY KEY,
      alias TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'available',
      assigned_conscript_id TEXT,
      login_url TEXT,
      expires_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS chat_messages (
      id TEXT PRIMARY KEY,
      conscript_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      timestamp TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS directive_runs (
      id TEXT PRIMARY KEY,
      directive_id TEXT NOT NULL,
      conscript_id TEXT NOT NULL,
      camp_alias TEXT,
      branch_name TEXT,
      status TEXT NOT NULL DEFAULT 'running',
      started_at TEXT NOT NULL,
      completed_at TEXT,
      human_intervention_count INTEGER NOT NULL DEFAULT 0,
      rework_count INTEGER NOT NULL DEFAULT 0,
      prompt_tokens_used INTEGER NOT NULL DEFAULT 0,
      completion_tokens_used INTEGER NOT NULL DEFAULT 0,
      interventions TEXT NOT NULL DEFAULT '[]'
    );

    CREATE TABLE IF NOT EXISTS refined_prompts (
      id TEXT PRIMARY KEY,
      directive_id TEXT NOT NULL,
      run_id TEXT,
      prompt_text TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS identity_templates (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT '',
      goal TEXT NOT NULL DEFAULT '',
      backstory TEXT NOT NULL DEFAULT '',
      portrait TEXT,
      system_prompt TEXT NOT NULL DEFAULT '',
      model TEXT NOT NULL DEFAULT 'sonnet',
      effort TEXT NOT NULL DEFAULT 'high',
      max_turns INTEGER,
      max_budget_usd REAL,
      allowed_tools TEXT NOT NULL DEFAULT '[]',
      disallowed_tools TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS workflow_templates (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      stages TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS pipeline_runs (
      id TEXT PRIMARY KEY,
      directive_id TEXT NOT NULL,
      workflow_template_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'running',
      current_stage_index INTEGER NOT NULL DEFAULT 0,
      stage_outputs TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  // Migrations: add new camps columns (safe to re-run)
  const campCols = ['camp_id TEXT', 'username TEXT', 'edition TEXT', 'instance_url TEXT', 'dev_hub_alias TEXT', 'namespace TEXT'];
  for (const col of campCols) {
    try { db.prepare(`ALTER TABLE camps ADD COLUMN ${col}`).run(); } catch { /* column already exists */ }
  }

  // Migration: assigned_conscript_id → assigned_conscript_ids (JSON array)
  try {
    db.prepare('SELECT assigned_conscript_ids FROM camps LIMIT 1').get();
  } catch {
    db.exec("ALTER TABLE camps ADD COLUMN assigned_conscript_ids TEXT NOT NULL DEFAULT '[]'");
    const campRows = db.prepare('SELECT id, assigned_conscript_id FROM camps WHERE assigned_conscript_id IS NOT NULL').all() as any[];
    const migrateStmt = db.prepare('UPDATE camps SET assigned_conscript_ids = ? WHERE id = ?');
    for (const row of campRows) {
      migrateStmt.run(JSON.stringify([row.assigned_conscript_id]), row.id);
    }
  }

  // Migration: add workflow_template_id to directives
  try { db.prepare('SELECT workflow_template_id FROM directives LIMIT 1').get(); }
  catch { db.exec('ALTER TABLE directives ADD COLUMN workflow_template_id TEXT'); }

  // Migration: rename old tables → new tables (agents→conscripts, tickets→directives, etc.)
  migrateOldTables();
}

function tableExists(name: string): boolean {
  const row = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(name);
  return !!row;
}

function tableHasRows(name: string): boolean {
  const row = db.prepare(`SELECT COUNT(*) as cnt FROM ${name}`).get() as { cnt: number };
  return row.cnt > 0;
}

function migrateOldTables(): void {
  // Migrate agents → conscripts
  if (tableExists('agents') && tableHasRows('agents')) {
    const existing = (db.prepare('SELECT COUNT(*) as cnt FROM conscripts').get() as { cnt: number }).cnt;
    if (existing === 0) {
      db.exec(`
        INSERT INTO conscripts (id, name, status, assigned_directive_id, assigned_camp_alias, branch_name, created_at, updated_at)
        SELECT id, name, status, assigned_ticket_id, assigned_org_alias, branch_name, created_at, updated_at
        FROM agents
      `);
    }
    db.exec('DROP TABLE agents');
  }

  // Migrate tickets → directives
  if (tableExists('tickets') && tableHasRows('tickets')) {
    const existing = (db.prepare('SELECT COUNT(*) as cnt FROM directives').get() as { cnt: number }).cnt;
    if (existing === 0) {
      db.exec(`
        INSERT INTO directives (id, external_id, source, title, description, acceptance_criteria, labels, priority, status, depends_on, assigned_conscript_id, created_at, updated_at)
        SELECT id, external_id, source, title, description, acceptance_criteria, labels, priority, status, depends_on, assigned_agent_id, created_at, updated_at
        FROM tickets
      `);
    }
    db.exec('DROP TABLE tickets');
  }

  // Migrate scratch_orgs → camps
  if (tableExists('scratch_orgs') && tableHasRows('scratch_orgs')) {
    const existing = (db.prepare('SELECT COUNT(*) as cnt FROM camps').get() as { cnt: number }).cnt;
    if (existing === 0) {
      db.exec(`
        INSERT INTO camps (id, alias, status, assigned_conscript_id, login_url, expires_at, created_at, updated_at, camp_id, username, edition, instance_url, dev_hub_alias, namespace)
        SELECT id, alias, status, assigned_agent_id, login_url, expires_at, created_at, updated_at, org_id, username, edition, instance_url, dev_hub_alias, namespace
        FROM scratch_orgs
      `);
    }
    db.exec('DROP TABLE scratch_orgs');
  }

  // Migrate ticket_runs → directive_runs
  if (tableExists('ticket_runs') && tableHasRows('ticket_runs')) {
    const existing = (db.prepare('SELECT COUNT(*) as cnt FROM directive_runs').get() as { cnt: number }).cnt;
    if (existing === 0) {
      db.exec(`
        INSERT INTO directive_runs (id, directive_id, conscript_id, camp_alias, branch_name, status, started_at, completed_at, human_intervention_count, rework_count, prompt_tokens_used, completion_tokens_used, interventions)
        SELECT id, ticket_id, agent_id, org_alias, branch_name, status, started_at, completed_at, human_intervention_count, rework_count, prompt_tokens_used, completion_tokens_used, interventions
        FROM ticket_runs
      `);
    }
    db.exec('DROP TABLE ticket_runs');
  }

  // Fix chat_messages: rename agent_id → conscript_id
  // SQLite doesn't support RENAME COLUMN in older versions, so recreate the table
  const chatInfo = db.prepare("PRAGMA table_info(chat_messages)").all() as Array<{ name: string }>;
  const hasAgentId = chatInfo.some((col) => col.name === 'agent_id');
  if (hasAgentId) {
    db.exec(`
      CREATE TABLE chat_messages_new (
        id TEXT PRIMARY KEY,
        conscript_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        timestamp TEXT NOT NULL
      );
      INSERT INTO chat_messages_new (id, conscript_id, role, content, timestamp)
      SELECT id, agent_id, role, content, timestamp FROM chat_messages;
      DROP TABLE chat_messages;
      ALTER TABLE chat_messages_new RENAME TO chat_messages;
    `);
  }

  // Clean up empty old tables that had no data
  for (const old of ['agents', 'tickets', 'scratch_orgs', 'ticket_runs']) {
    if (tableExists(old)) {
      db.exec(`DROP TABLE ${old}`);
    }
  }
}

export function closeDatabase(): void {
  if (db) db.close();
}

// ===== Row → Object Helpers =====

function rowToDirective(row: Record<string, unknown>): Directive {
  return {
    id: row.id as string,
    externalId: row.external_id as string | undefined,
    source: row.source as Directive['source'],
    title: row.title as string,
    description: row.description as string,
    acceptanceCriteria: row.acceptance_criteria as string,
    labels: JSON.parse(row.labels as string),
    priority: row.priority as Directive['priority'],
    status: row.status as Directive['status'],
    dependsOn: JSON.parse(row.depends_on as string),
    assignedConscriptId: row.assigned_conscript_id as string | undefined,
    workflowTemplateId: (row.workflow_template_id as string) || undefined,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

function rowToConscript(row: Record<string, unknown>): Conscript {
  return {
    id: row.id as string,
    name: row.name as string,
    status: row.status as Conscript['status'],
    assignedDirectiveId: row.assigned_directive_id as string | undefined,
    assignedCampAlias: row.assigned_camp_alias as string | undefined,
    branchName: row.branch_name as string | undefined,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

function rowToCamp(row: Record<string, unknown>): Camp {
  let assignedConscriptIds: string[] = [];
  try {
    assignedConscriptIds = JSON.parse((row.assigned_conscript_ids as string) || '[]');
  } catch { /* default empty */ }
  return {
    id: row.id as string,
    alias: row.alias as string,
    status: row.status as Camp['status'],
    assignedConscriptIds,
    loginUrl: row.login_url as string | undefined,
    expiresAt: row.expires_at as string | undefined,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
    campId: (row.camp_id as string) || undefined,
    username: (row.username as string) || undefined,
    edition: (row.edition as string) || undefined,
    instanceUrl: (row.instance_url as string) || undefined,
    devHubAlias: (row.dev_hub_alias as string) || undefined,
    namespace: (row.namespace as string) || undefined,
  };
}

function rowToMessage(row: Record<string, unknown>): ChatMessage {
  return {
    id: row.id as string,
    conscriptId: row.conscript_id as string,
    role: row.role as ChatMessage['role'],
    content: row.content as string,
    timestamp: row.timestamp as string,
  };
}

function rowToRun(row: Record<string, unknown>): DirectiveRun {
  return {
    id: row.id as string,
    directiveId: row.directive_id as string,
    conscriptId: row.conscript_id as string,
    campAlias: row.camp_alias as string | undefined,
    branchName: row.branch_name as string | undefined,
    status: row.status as DirectiveRun['status'],
    startedAt: row.started_at as string,
    completedAt: row.completed_at as string | undefined,
    humanInterventionCount: row.human_intervention_count as number,
    reworkCount: row.rework_count as number,
    promptTokensUsed: row.prompt_tokens_used as number,
    completionTokensUsed: row.completion_tokens_used as number,
    interventions: JSON.parse(row.interventions as string),
  };
}

// ===== Directives =====

export function listDirectives(filter?: { status?: DirectiveStatus }): Directive[] {
  if (filter?.status) {
    const rows = db.prepare('SELECT * FROM directives WHERE status = ? ORDER BY created_at DESC').all(filter.status);
    return rows.map((r) => rowToDirective(r as Record<string, unknown>));
  }
  const rows = db.prepare('SELECT * FROM directives ORDER BY created_at DESC').all();
  return rows.map((r) => rowToDirective(r as Record<string, unknown>));
}

export function getDirective(id: string): Directive | null {
  const row = db.prepare('SELECT * FROM directives WHERE id = ?').get(id);
  return row ? rowToDirective(row as Record<string, unknown>) : null;
}

export function createDirective(data: Omit<Directive, 'id' | 'createdAt' | 'updatedAt'>): Directive {
  const id = uuid();
  const ts = now();
  db.prepare(`
    INSERT INTO directives (id, external_id, source, title, description, acceptance_criteria,
      labels, priority, status, depends_on, assigned_conscript_id, workflow_template_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, data.externalId ?? null, data.source, data.title, data.description,
    data.acceptanceCriteria, JSON.stringify(data.labels), data.priority,
    data.status, JSON.stringify(data.dependsOn), data.assignedConscriptId ?? null,
    data.workflowTemplateId ?? null, ts, ts
  );
  return getDirective(id)!;
}

export function updateDirective(id: string, data: Partial<Directive>): Directive {
  const existing = getDirective(id);
  if (!existing) throw new Error(`Directive ${id} not found`);

  const merged = { ...existing, ...data, updatedAt: now() };
  db.prepare(`
    UPDATE directives SET external_id = ?, source = ?, title = ?, description = ?,
      acceptance_criteria = ?, labels = ?, priority = ?, status = ?, depends_on = ?,
      assigned_conscript_id = ?, workflow_template_id = ?, updated_at = ?
    WHERE id = ?
  `).run(
    merged.externalId ?? null, merged.source, merged.title, merged.description,
    merged.acceptanceCriteria, JSON.stringify(merged.labels), merged.priority,
    merged.status, JSON.stringify(merged.dependsOn), merged.assignedConscriptId ?? null,
    merged.workflowTemplateId ?? null, merged.updatedAt, id
  );
  return getDirective(id)!;
}

export function deleteDirective(id: string): void {
  db.prepare('DELETE FROM directives WHERE id = ?').run(id);
}

// ===== Conscripts =====

export function listConscripts(): Conscript[] {
  const rows = db.prepare('SELECT * FROM conscripts ORDER BY created_at ASC').all();
  return rows.map((r) => rowToConscript(r as Record<string, unknown>));
}

export function getConscript(id: string): Conscript | null {
  const row = db.prepare('SELECT * FROM conscripts WHERE id = ?').get(id);
  return row ? rowToConscript(row as Record<string, unknown>) : null;
}

export function createConscript(data: Omit<Conscript, 'id' | 'createdAt' | 'updatedAt'>): Conscript {
  const id = uuid();
  const ts = now();
  db.prepare(`
    INSERT INTO conscripts (id, name, status, assigned_directive_id, assigned_camp_alias, branch_name, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, data.name, data.status, data.assignedDirectiveId ?? null,
    data.assignedCampAlias ?? null, data.branchName ?? null, ts, ts);
  return getConscript(id)!;
}

export function deleteConscript(id: string): void {
  db.prepare('DELETE FROM chat_messages WHERE conscript_id = ?').run(id);
  db.prepare('DELETE FROM conscripts WHERE id = ?').run(id);
}

export function updateConscript(id: string, data: Partial<Conscript>): Conscript {
  const existing = getConscript(id);
  if (!existing) throw new Error(`Conscript ${id} not found`);

  const merged = { ...existing, ...data, updatedAt: now() };
  db.prepare(`
    UPDATE conscripts SET name = ?, status = ?, assigned_directive_id = ?,
      assigned_camp_alias = ?, branch_name = ?, updated_at = ?
    WHERE id = ?
  `).run(merged.name, merged.status, merged.assignedDirectiveId ?? null,
    merged.assignedCampAlias ?? null, merged.branchName ?? null, merged.updatedAt, id);
  return getConscript(id)!;
}

// ===== Camps =====

export function listCamps(): Camp[] {
  const rows = db.prepare('SELECT * FROM camps ORDER BY created_at ASC').all();
  return rows.map((r) => rowToCamp(r as Record<string, unknown>));
}

export function claimCamp(conscriptId: string, allowShared = false, maxPerCamp = 3): Camp | null {
  if (allowShared) {
    // Prefer co-locating: find a leased camp with capacity first
    const allCamps = listCamps();
    const withCapacity = allCamps
      .filter((c) => (c.status === 'leased' || c.status === 'available') && c.assignedConscriptIds.length < maxPerCamp)
      .sort((a, b) => b.assignedConscriptIds.length - a.assignedConscriptIds.length); // prefer already-occupied
    const camp = withCapacity[0];
    if (!camp) return null;
    const newIds = [...camp.assignedConscriptIds, conscriptId];
    db.prepare(`
      UPDATE camps SET status = 'leased', assigned_conscript_ids = ?, updated_at = ?
      WHERE id = ?
    `).run(JSON.stringify(newIds), now(), camp.id);
    return { ...camp, status: 'leased', assignedConscriptIds: newIds };
  }

  // Exclusive mode: find first available camp
  const row = db.prepare(
    "SELECT * FROM camps WHERE status = 'available' LIMIT 1"
  ).get();
  if (!row) return null;

  const camp = rowToCamp(row as Record<string, unknown>);
  const newIds = [conscriptId];
  db.prepare(`
    UPDATE camps SET status = 'leased', assigned_conscript_ids = ?, updated_at = ?
    WHERE id = ?
  `).run(JSON.stringify(newIds), now(), camp.id);
  return { ...camp, status: 'leased', assignedConscriptIds: newIds };
}

export function releaseCamp(campId: string, conscriptId?: string): void {
  if (conscriptId) {
    // Remove specific conscript from the array
    const camp = getCampById(campId);
    if (!camp) return;
    const newIds = camp.assignedConscriptIds.filter((id) => id !== conscriptId);
    if (newIds.length === 0) {
      db.prepare(`
        UPDATE camps SET status = 'available', assigned_conscript_ids = '[]', updated_at = ?
        WHERE id = ?
      `).run(now(), campId);
    } else {
      db.prepare(`
        UPDATE camps SET assigned_conscript_ids = ?, updated_at = ?
        WHERE id = ?
      `).run(JSON.stringify(newIds), now(), campId);
    }
  } else {
    // Release entire camp (clear all)
    db.prepare(`
      UPDATE camps SET status = 'available', assigned_conscript_ids = '[]', updated_at = ?
      WHERE id = ?
    `).run(now(), campId);
  }
}

export function registerCamp(data: {
  alias: string;
  status: Camp['status'];
  expiresAt?: string;
  loginUrl?: string;
  campId?: string;
  username?: string;
  edition?: string;
  instanceUrl?: string;
  devHubAlias?: string;
  namespace?: string;
}): Camp {
  const id = uuid();
  const createdAt = now();
  db.prepare(`
    INSERT INTO camps (id, alias, status, login_url, expires_at, created_at, updated_at, camp_id, username, edition, instance_url, dev_hub_alias, namespace)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, data.alias, data.status, data.loginUrl ?? null, data.expiresAt ?? null,
    createdAt, createdAt,
    data.campId ?? null, data.username ?? null, data.edition ?? null,
    data.instanceUrl ?? null, data.devHubAlias ?? null, data.namespace ?? null,
  );
  return {
    id, alias: data.alias, status: data.status,
    assignedConscriptIds: [],
    loginUrl: data.loginUrl, expiresAt: data.expiresAt,
    createdAt, updatedAt: createdAt,
    campId: data.campId, username: data.username, edition: data.edition,
    instanceUrl: data.instanceUrl, devHubAlias: data.devHubAlias, namespace: data.namespace,
  };
}

export function updateCamp(id: string, data: Partial<Camp>): void {
  const map: [string, string][] = [
    ['status', 'status'], ['loginUrl', 'login_url'], ['expiresAt', 'expires_at'],
    ['campId', 'camp_id'], ['username', 'username'],
    ['edition', 'edition'], ['instanceUrl', 'instance_url'], ['devHubAlias', 'dev_hub_alias'],
    ['namespace', 'namespace'],
  ];
  const fields: string[] = [];
  const values: unknown[] = [];
  for (const [key, col] of map) {
    if ((data as any)[key] !== undefined) { fields.push(`${col} = ?`); values.push((data as any)[key]); }
  }
  // Handle assignedConscriptIds as JSON array
  if (data.assignedConscriptIds !== undefined) {
    fields.push('assigned_conscript_ids = ?');
    values.push(JSON.stringify(data.assignedConscriptIds));
  }
  if (fields.length === 0) return;
  fields.push('updated_at = ?');
  values.push(now());
  values.push(id);
  db.prepare(`UPDATE camps SET ${fields.join(', ')} WHERE id = ?`).run(...values);
}

export function getCampById(id: string): Camp | null {
  const row = db.prepare('SELECT * FROM camps WHERE id = ?').get(id) as Record<string, unknown> | undefined;
  return row ? rowToCamp(row) : null;
}

export function findCampByAlias(alias: string): Camp | null {
  const row = db.prepare('SELECT * FROM camps WHERE alias = ?').get(alias) as Record<string, unknown> | undefined;
  return row ? rowToCamp(row) : null;
}

export function deleteCamp(id: string): void {
  db.prepare('DELETE FROM camps WHERE id = ?').run(id);
}

export function deleteCampByAlias(alias: string): void {
  db.prepare('DELETE FROM camps WHERE alias = ?').run(alias);
}

// ===== Chat Messages =====

export function chatHistory(conscriptId: string): ChatMessage[] {
  const rows = db.prepare('SELECT * FROM chat_messages WHERE conscript_id = ? ORDER BY timestamp ASC').all(conscriptId);
  return rows.map((r) => rowToMessage(r as Record<string, unknown>));
}

export function chatSend(conscriptId: string, content: string, role: ChatMessage['role'] = 'user'): ChatMessage {
  const id = uuid();
  const ts = now();
  db.prepare(`
    INSERT INTO chat_messages (id, conscript_id, role, content, timestamp)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, conscriptId, role, content, ts);
  return { id, conscriptId, role, content, timestamp: ts };
}

// ===== Directive Runs =====

export function listRuns(directiveId?: string): DirectiveRun[] {
  if (directiveId) {
    const rows = db.prepare('SELECT * FROM directive_runs WHERE directive_id = ? ORDER BY started_at DESC').all(directiveId);
    return rows.map((r) => rowToRun(r as Record<string, unknown>));
  }
  const rows = db.prepare('SELECT * FROM directive_runs ORDER BY started_at DESC').all();
  return rows.map((r) => rowToRun(r as Record<string, unknown>));
}

export function getRun(id: string): DirectiveRun | null {
  const row = db.prepare('SELECT * FROM directive_runs WHERE id = ?').get(id);
  return row ? rowToRun(row as Record<string, unknown>) : null;
}

export function currentRun(conscriptId: string): DirectiveRun | null {
  const row = db.prepare(
    "SELECT * FROM directive_runs WHERE conscript_id = ? AND status = 'running' ORDER BY started_at DESC LIMIT 1"
  ).get(conscriptId);
  return row ? rowToRun(row as Record<string, unknown>) : null;
}

export function createRun(data: {
  id: string;
  directiveId: string;
  conscriptId: string;
  campAlias?: string;
  branchName?: string;
}): DirectiveRun {
  const ts = now();
  db.prepare(`
    INSERT INTO directive_runs (id, directive_id, conscript_id, camp_alias, branch_name, status, started_at)
    VALUES (?, ?, ?, ?, ?, 'running', ?)
  `).run(data.id, data.directiveId, data.conscriptId, data.campAlias ?? null, data.branchName ?? null, ts);
  return getRun(data.id)!;
}

export function updateRun(id: string, data: Partial<{
  status: string;
  completedAt: string;
  promptTokensUsed: number;
  completionTokensUsed: number;
  reworkCount: number;
}>): void {
  const fields: string[] = [];
  const values: unknown[] = [];
  if (data.status !== undefined) { fields.push('status = ?'); values.push(data.status); }
  if (data.completedAt !== undefined) { fields.push('completed_at = ?'); values.push(data.completedAt); }
  if (data.promptTokensUsed !== undefined) { fields.push('prompt_tokens_used = ?'); values.push(data.promptTokensUsed); }
  if (data.completionTokensUsed !== undefined) { fields.push('completion_tokens_used = ?'); values.push(data.completionTokensUsed); }
  if (data.reworkCount !== undefined) { fields.push('rework_count = ?'); values.push(data.reworkCount); }
  if (fields.length === 0) return;
  values.push(id);
  db.prepare(`UPDATE directive_runs SET ${fields.join(', ')} WHERE id = ?`).run(...values);
}

export function incrementIntervention(runId: string, event: InterventionEvent): void {
  const run = getRun(runId);
  if (!run) throw new Error(`Run ${runId} not found`);

  const interventions = [...run.interventions, event];
  db.prepare(`
    UPDATE directive_runs SET human_intervention_count = human_intervention_count + 1,
      interventions = ?, updated_at = ?
    WHERE id = ?
  `).run(JSON.stringify(interventions), now(), runId);
}

// ===== Refined Prompts =====

export function createRefinedPrompt(data: {
  directiveId: string;
  runId?: string;
  promptText: string;
}): RefinedPrompt {
  const id = uuid();
  const createdAt = now();
  db.prepare(`
    INSERT INTO refined_prompts (id, directive_id, run_id, prompt_text, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, data.directiveId, data.runId ?? null, data.promptText, createdAt);
  return { id, directiveId: data.directiveId, runId: data.runId ?? '', promptText: data.promptText, createdAt };
}

// ===== Identity Templates =====

function rowToIdentityTemplate(row: Record<string, unknown>): IdentityTemplate {
  return {
    id: row.id as string,
    name: row.name as string,
    role: row.role as string,
    goal: row.goal as string,
    backstory: row.backstory as string,
    portrait: (row.portrait as string) || null,
    systemPrompt: row.system_prompt as string,
    model: row.model as IdentityTemplate['model'],
    effort: row.effort as IdentityTemplate['effort'],
    maxTurns: row.max_turns as number | null,
    maxBudgetUsd: row.max_budget_usd as number | null,
    allowedTools: JSON.parse(row.allowed_tools as string),
    disallowedTools: JSON.parse(row.disallowed_tools as string),
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

export function listIdentityTemplates(): IdentityTemplate[] {
  const rows = db.prepare('SELECT * FROM identity_templates ORDER BY created_at DESC').all();
  return rows.map((r) => rowToIdentityTemplate(r as Record<string, unknown>));
}

export function getIdentityTemplate(id: string): IdentityTemplate | null {
  const row = db.prepare('SELECT * FROM identity_templates WHERE id = ?').get(id);
  return row ? rowToIdentityTemplate(row as Record<string, unknown>) : null;
}

export function createIdentityTemplate(data: Omit<IdentityTemplate, 'id' | 'createdAt' | 'updatedAt'>): IdentityTemplate {
  const id = uuid();
  const ts = now();
  db.prepare(`
    INSERT INTO identity_templates (id, name, role, goal, backstory, portrait, system_prompt,
      model, effort, max_turns, max_budget_usd, allowed_tools, disallowed_tools, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, data.name, data.role, data.goal, data.backstory, data.portrait ?? null,
    data.systemPrompt, data.model, data.effort, data.maxTurns ?? null,
    data.maxBudgetUsd ?? null, JSON.stringify(data.allowedTools),
    JSON.stringify(data.disallowedTools), ts, ts
  );
  return getIdentityTemplate(id)!;
}

export function updateIdentityTemplate(id: string, data: Partial<IdentityTemplate>): IdentityTemplate {
  const existing = getIdentityTemplate(id);
  if (!existing) throw new Error(`Identity template ${id} not found`);

  const merged = { ...existing, ...data, updatedAt: now() };
  db.prepare(`
    UPDATE identity_templates SET name = ?, role = ?, goal = ?, backstory = ?, portrait = ?,
      system_prompt = ?, model = ?, effort = ?, max_turns = ?, max_budget_usd = ?,
      allowed_tools = ?, disallowed_tools = ?, updated_at = ?
    WHERE id = ?
  `).run(
    merged.name, merged.role, merged.goal, merged.backstory, merged.portrait ?? null,
    merged.systemPrompt, merged.model, merged.effort, merged.maxTurns ?? null,
    merged.maxBudgetUsd ?? null, JSON.stringify(merged.allowedTools),
    JSON.stringify(merged.disallowedTools), merged.updatedAt, id
  );
  return getIdentityTemplate(id)!;
}

export function deleteIdentityTemplate(id: string): void {
  db.prepare('DELETE FROM identity_templates WHERE id = ?').run(id);
}

// ===== Workflow Templates =====

function rowToWorkflowTemplate(row: Record<string, unknown>): WorkflowTemplate {
  return {
    id: row.id as string,
    name: row.name as string,
    description: row.description as string,
    stages: JSON.parse(row.stages as string),
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

export function listWorkflowTemplates(): WorkflowTemplate[] {
  const rows = db.prepare('SELECT * FROM workflow_templates ORDER BY created_at DESC').all();
  return rows.map((r) => rowToWorkflowTemplate(r as Record<string, unknown>));
}

export function getWorkflowTemplate(id: string): WorkflowTemplate | null {
  const row = db.prepare('SELECT * FROM workflow_templates WHERE id = ?').get(id);
  return row ? rowToWorkflowTemplate(row as Record<string, unknown>) : null;
}

export function createWorkflowTemplate(data: Omit<WorkflowTemplate, 'id' | 'createdAt' | 'updatedAt'>): WorkflowTemplate {
  const id = uuid();
  const ts = now();
  db.prepare(`
    INSERT INTO workflow_templates (id, name, description, stages, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, data.name, data.description, JSON.stringify(data.stages), ts, ts);
  return getWorkflowTemplate(id)!;
}

export function updateWorkflowTemplate(id: string, data: Partial<WorkflowTemplate>): WorkflowTemplate {
  const existing = getWorkflowTemplate(id);
  if (!existing) throw new Error(`Workflow template ${id} not found`);

  const merged = { ...existing, ...data, updatedAt: now() };
  db.prepare(`
    UPDATE workflow_templates SET name = ?, description = ?, stages = ?, updated_at = ?
    WHERE id = ?
  `).run(merged.name, merged.description, JSON.stringify(merged.stages), merged.updatedAt, id);
  return getWorkflowTemplate(id)!;
}

export function deleteWorkflowTemplate(id: string): void {
  db.prepare('DELETE FROM workflow_templates WHERE id = ?').run(id);
}

// ===== Pipeline Runs =====

function rowToPipelineRun(row: Record<string, unknown>): PipelineRun {
  return {
    id: row.id as string,
    directiveId: row.directive_id as string,
    workflowTemplateId: row.workflow_template_id as string,
    status: row.status as PipelineRun['status'],
    currentStageIndex: row.current_stage_index as number,
    stageOutputs: JSON.parse(row.stage_outputs as string),
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

export function createPipelineRun(data: {
  directiveId: string;
  workflowTemplateId: string;
}): PipelineRun {
  const id = uuid();
  const ts = now();
  db.prepare(`
    INSERT INTO pipeline_runs (id, directive_id, workflow_template_id, status, current_stage_index, stage_outputs, created_at, updated_at)
    VALUES (?, ?, ?, 'running', 0, '[]', ?, ?)
  `).run(id, data.directiveId, data.workflowTemplateId, ts, ts);
  return getPipelineRun(id)!;
}

export function getPipelineRun(id: string): PipelineRun | null {
  const row = db.prepare('SELECT * FROM pipeline_runs WHERE id = ?').get(id) as Record<string, unknown> | undefined;
  return row ? rowToPipelineRun(row) : null;
}

export function getPipelineRunForDirective(directiveId: string): PipelineRun | null {
  const row = db.prepare('SELECT * FROM pipeline_runs WHERE directive_id = ? ORDER BY created_at DESC LIMIT 1').get(directiveId) as Record<string, unknown> | undefined;
  return row ? rowToPipelineRun(row) : null;
}

export function updatePipelineRun(id: string, data: Partial<PipelineRun>): void {
  const existing = getPipelineRun(id);
  if (!existing) return;
  const merged = { ...existing, ...data, updatedAt: now() };
  db.prepare(`
    UPDATE pipeline_runs SET status = ?, current_stage_index = ?, stage_outputs = ?, updated_at = ?
    WHERE id = ?
  `).run(merged.status, merged.currentStageIndex, JSON.stringify(merged.stageOutputs), merged.updatedAt, id);
}
