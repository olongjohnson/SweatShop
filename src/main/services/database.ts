import Database from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';
import type {
  Ticket, TicketStatus, Agent, ScratchOrg, ChatMessage,
  TicketRun, InterventionEvent, RefinedPrompt,
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
    CREATE TABLE IF NOT EXISTS tickets (
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
      assigned_agent_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS agents (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'IDLE',
      assigned_ticket_id TEXT,
      assigned_org_alias TEXT,
      branch_name TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS scratch_orgs (
      id TEXT PRIMARY KEY,
      alias TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'available',
      assigned_agent_id TEXT,
      login_url TEXT,
      expires_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS chat_messages (
      id TEXT PRIMARY KEY,
      agent_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      timestamp TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS ticket_runs (
      id TEXT PRIMARY KEY,
      ticket_id TEXT NOT NULL,
      agent_id TEXT NOT NULL,
      org_alias TEXT,
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
      ticket_id TEXT NOT NULL,
      run_id TEXT,
      prompt_text TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);
}

export function closeDatabase(): void {
  if (db) db.close();
}

// ===== Row ↔ Object Helpers =====

function rowToTicket(row: Record<string, unknown>): Ticket {
  return {
    id: row.id as string,
    externalId: row.external_id as string | undefined,
    source: row.source as Ticket['source'],
    title: row.title as string,
    description: row.description as string,
    acceptanceCriteria: row.acceptance_criteria as string,
    labels: JSON.parse(row.labels as string),
    priority: row.priority as Ticket['priority'],
    status: row.status as Ticket['status'],
    dependsOn: JSON.parse(row.depends_on as string),
    assignedAgentId: row.assigned_agent_id as string | undefined,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

function rowToAgent(row: Record<string, unknown>): Agent {
  return {
    id: row.id as string,
    name: row.name as string,
    status: row.status as Agent['status'],
    assignedTicketId: row.assigned_ticket_id as string | undefined,
    assignedOrgAlias: row.assigned_org_alias as string | undefined,
    branchName: row.branch_name as string | undefined,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

function rowToOrg(row: Record<string, unknown>): ScratchOrg {
  return {
    id: row.id as string,
    alias: row.alias as string,
    status: row.status as ScratchOrg['status'],
    assignedAgentId: row.assigned_agent_id as string | undefined,
    loginUrl: row.login_url as string | undefined,
    expiresAt: row.expires_at as string | undefined,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

function rowToMessage(row: Record<string, unknown>): ChatMessage {
  return {
    id: row.id as string,
    agentId: row.agent_id as string,
    role: row.role as ChatMessage['role'],
    content: row.content as string,
    timestamp: row.timestamp as string,
  };
}

function rowToRun(row: Record<string, unknown>): TicketRun {
  return {
    id: row.id as string,
    ticketId: row.ticket_id as string,
    agentId: row.agent_id as string,
    orgAlias: row.org_alias as string | undefined,
    branchName: row.branch_name as string | undefined,
    status: row.status as TicketRun['status'],
    startedAt: row.started_at as string,
    completedAt: row.completed_at as string | undefined,
    humanInterventionCount: row.human_intervention_count as number,
    reworkCount: row.rework_count as number,
    promptTokensUsed: row.prompt_tokens_used as number,
    completionTokensUsed: row.completion_tokens_used as number,
    interventions: JSON.parse(row.interventions as string),
  };
}

// ===== Tickets =====

export function listTickets(filter?: { status?: TicketStatus }): Ticket[] {
  if (filter?.status) {
    const rows = db.prepare('SELECT * FROM tickets WHERE status = ? ORDER BY created_at DESC').all(filter.status);
    return rows.map((r) => rowToTicket(r as Record<string, unknown>));
  }
  const rows = db.prepare('SELECT * FROM tickets ORDER BY created_at DESC').all();
  return rows.map((r) => rowToTicket(r as Record<string, unknown>));
}

export function getTicket(id: string): Ticket | null {
  const row = db.prepare('SELECT * FROM tickets WHERE id = ?').get(id);
  return row ? rowToTicket(row as Record<string, unknown>) : null;
}

export function createTicket(data: Omit<Ticket, 'id' | 'createdAt' | 'updatedAt'>): Ticket {
  const id = uuid();
  const ts = now();
  db.prepare(`
    INSERT INTO tickets (id, external_id, source, title, description, acceptance_criteria,
      labels, priority, status, depends_on, assigned_agent_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, data.externalId ?? null, data.source, data.title, data.description,
    data.acceptanceCriteria, JSON.stringify(data.labels), data.priority,
    data.status, JSON.stringify(data.dependsOn), data.assignedAgentId ?? null, ts, ts
  );
  return getTicket(id)!;
}

export function updateTicket(id: string, data: Partial<Ticket>): Ticket {
  const existing = getTicket(id);
  if (!existing) throw new Error(`Ticket ${id} not found`);

  const merged = { ...existing, ...data, updatedAt: now() };
  db.prepare(`
    UPDATE tickets SET external_id = ?, source = ?, title = ?, description = ?,
      acceptance_criteria = ?, labels = ?, priority = ?, status = ?, depends_on = ?,
      assigned_agent_id = ?, updated_at = ?
    WHERE id = ?
  `).run(
    merged.externalId ?? null, merged.source, merged.title, merged.description,
    merged.acceptanceCriteria, JSON.stringify(merged.labels), merged.priority,
    merged.status, JSON.stringify(merged.dependsOn), merged.assignedAgentId ?? null,
    merged.updatedAt, id
  );
  return getTicket(id)!;
}

export function deleteTicket(id: string): void {
  db.prepare('DELETE FROM tickets WHERE id = ?').run(id);
}

// ===== Agents =====

export function listAgents(): Agent[] {
  const rows = db.prepare('SELECT * FROM agents ORDER BY created_at ASC').all();
  return rows.map((r) => rowToAgent(r as Record<string, unknown>));
}

export function getAgent(id: string): Agent | null {
  const row = db.prepare('SELECT * FROM agents WHERE id = ?').get(id);
  return row ? rowToAgent(row as Record<string, unknown>) : null;
}

export function createAgent(data: Omit<Agent, 'id' | 'createdAt' | 'updatedAt'>): Agent {
  const id = uuid();
  const ts = now();
  db.prepare(`
    INSERT INTO agents (id, name, status, assigned_ticket_id, assigned_org_alias, branch_name, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, data.name, data.status, data.assignedTicketId ?? null,
    data.assignedOrgAlias ?? null, data.branchName ?? null, ts, ts);
  return getAgent(id)!;
}

export function updateAgent(id: string, data: Partial<Agent>): Agent {
  const existing = getAgent(id);
  if (!existing) throw new Error(`Agent ${id} not found`);

  const merged = { ...existing, ...data, updatedAt: now() };
  db.prepare(`
    UPDATE agents SET name = ?, status = ?, assigned_ticket_id = ?,
      assigned_org_alias = ?, branch_name = ?, updated_at = ?
    WHERE id = ?
  `).run(merged.name, merged.status, merged.assignedTicketId ?? null,
    merged.assignedOrgAlias ?? null, merged.branchName ?? null, merged.updatedAt, id);
  return getAgent(id)!;
}

// ===== Scratch Orgs =====

export function listOrgs(): ScratchOrg[] {
  const rows = db.prepare('SELECT * FROM scratch_orgs ORDER BY created_at ASC').all();
  return rows.map((r) => rowToOrg(r as Record<string, unknown>));
}

export function claimOrg(agentId: string): ScratchOrg | null {
  const row = db.prepare(
    "SELECT * FROM scratch_orgs WHERE status = 'available' LIMIT 1"
  ).get();
  if (!row) return null;

  const org = rowToOrg(row as Record<string, unknown>);
  db.prepare(`
    UPDATE scratch_orgs SET status = 'leased', assigned_agent_id = ?, updated_at = ?
    WHERE id = ?
  `).run(agentId, now(), org.id);
  return { ...org, status: 'leased', assignedAgentId: agentId };
}

export function releaseOrg(orgId: string): void {
  db.prepare(`
    UPDATE scratch_orgs SET status = 'available', assigned_agent_id = NULL, updated_at = ?
    WHERE id = ?
  `).run(now(), orgId);
}

// ===== Chat Messages =====

export function chatHistory(agentId: string): ChatMessage[] {
  const rows = db.prepare('SELECT * FROM chat_messages WHERE agent_id = ? ORDER BY timestamp ASC').all(agentId);
  return rows.map((r) => rowToMessage(r as Record<string, unknown>));
}

export function chatSend(agentId: string, content: string, role: ChatMessage['role'] = 'user'): ChatMessage {
  const id = uuid();
  const ts = now();
  db.prepare(`
    INSERT INTO chat_messages (id, agent_id, role, content, timestamp)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, agentId, role, content, ts);
  return { id, agentId, role, content, timestamp: ts };
}

// ===== Ticket Runs =====

export function listRuns(ticketId?: string): TicketRun[] {
  if (ticketId) {
    const rows = db.prepare('SELECT * FROM ticket_runs WHERE ticket_id = ? ORDER BY started_at DESC').all(ticketId);
    return rows.map((r) => rowToRun(r as Record<string, unknown>));
  }
  const rows = db.prepare('SELECT * FROM ticket_runs ORDER BY started_at DESC').all();
  return rows.map((r) => rowToRun(r as Record<string, unknown>));
}

export function getRun(id: string): TicketRun | null {
  const row = db.prepare('SELECT * FROM ticket_runs WHERE id = ?').get(id);
  return row ? rowToRun(row as Record<string, unknown>) : null;
}

export function currentRun(agentId: string): TicketRun | null {
  const row = db.prepare(
    "SELECT * FROM ticket_runs WHERE agent_id = ? AND status = 'running' ORDER BY started_at DESC LIMIT 1"
  ).get(agentId);
  return row ? rowToRun(row as Record<string, unknown>) : null;
}

export function incrementIntervention(runId: string, event: InterventionEvent): void {
  const run = getRun(runId);
  if (!run) throw new Error(`Run ${runId} not found`);

  const interventions = [...run.interventions, event];
  db.prepare(`
    UPDATE ticket_runs SET human_intervention_count = human_intervention_count + 1,
      interventions = ?, updated_at = ?
    WHERE id = ?
  `).run(JSON.stringify(interventions), now(), runId);
}

// ===== Refined Prompts =====

export function createRefinedPrompt(data: {
  ticketId: string;
  runId?: string;
  promptText: string;
}): RefinedPrompt {
  const id = uuid();
  const createdAt = now();
  db.prepare(`
    INSERT INTO refined_prompts (id, ticket_id, run_id, prompt_text, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, data.ticketId, data.runId ?? null, data.promptText, createdAt);
  return { id, ticketId: data.ticketId, runId: data.runId ?? '', promptText: data.promptText, createdAt };
}
