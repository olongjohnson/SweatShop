# Prompt 03 — Data Layer (SQLite + IPC + Shared Types)

## Context

You are working on **SweatShop**, an Electron desktop app. Build pipeline and UI shell are in place. We now need the data backbone: SQLite for persistence, shared TypeScript types, and Electron IPC bridge so the renderer can read/write data through the main process.

## Task

Implement the data layer: database schema, typed IPC channels, and the service layer in the main process.

## Requirements

### 1. Install Dependencies

```
better-sqlite3
@types/better-sqlite3
```

Note: `better-sqlite3` is a native module. It may need `electron-rebuild` or a compatible prebuild. If `better-sqlite3` fails to install or load in Electron, use `sql.js` (pure WASM SQLite) as a fallback — it requires no native compilation.

### 2. Shared Types (`src/shared/types.ts`)

Define all data model interfaces:

```ts
// Agent states
export type AgentStatus =
  | 'IDLE'
  | 'ASSIGNED'
  | 'BRANCHING'
  | 'DEVELOPING'
  | 'NEEDS_INPUT'
  | 'PROVISIONING'
  | 'QA_READY'
  | 'MERGING'
  | 'REWORK'
  | 'ERROR';

// Ticket/story source
export type TicketSource = 'manual' | 'deathmark';

// Ticket status in SweatShop
export type TicketStatus =
  | 'backlog'
  | 'ready'
  | 'in_progress'
  | 'qa_review'
  | 'approved'
  | 'merged'
  | 'rejected';

export interface Ticket {
  id: string;                    // UUID
  externalId?: string;           // Deathmark record ID (if imported)
  source: TicketSource;
  title: string;
  description: string;
  acceptanceCriteria: string;
  labels: string[];              // JSON array stored as text
  priority: 'low' | 'medium' | 'high' | 'critical';
  status: TicketStatus;
  dependsOn: string[];           // IDs of tickets this depends on
  assignedAgentId?: string;
  createdAt: string;             // ISO timestamp
  updatedAt: string;
}

export interface Agent {
  id: string;                    // UUID
  name: string;                  // "Agent 1", "Agent 2", etc.
  status: AgentStatus;
  assignedTicketId?: string;
  assignedOrgAlias?: string;
  branchName?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ScratchOrg {
  id: string;                    // UUID
  alias: string;                 // sf CLI alias
  status: 'available' | 'leased' | 'expired' | 'error';
  assignedAgentId?: string;
  loginUrl?: string;
  expiresAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ChatMessage {
  id: string;
  agentId: string;
  role: 'agent' | 'user' | 'system';
  content: string;
  timestamp: string;
}

export interface TicketRun {
  id: string;                    // UUID
  ticketId: string;
  agentId: string;
  orgAlias?: string;
  branchName?: string;
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  startedAt: string;
  completedAt?: string;
  // Analytics fields
  humanInterventionCount: number;
  reworkCount: number;
  promptTokensUsed: number;
  completionTokensUsed: number;
  // Detailed intervention log
  interventions: InterventionEvent[];
}

export interface InterventionEvent {
  timestamp: string;
  type: 'question' | 'rework' | 'guidance' | 'error_recovery';
  agentMessage: string;         // What the agent asked/reported
  humanResponse?: string;       // What the human said
  waitDurationMs: number;       // How long the agent waited
}

export interface RefinedPrompt {
  id: string;
  ticketId: string;
  runId: string;
  promptText: string;
  createdAt: string;
}
```

### 3. IPC Channel Definitions (`src/shared/ipc-channels.ts`)

Define typed channel names and payload types:

```ts
export const IPC_CHANNELS = {
  // Tickets
  TICKET_LIST: 'ticket:list',
  TICKET_GET: 'ticket:get',
  TICKET_CREATE: 'ticket:create',
  TICKET_UPDATE: 'ticket:update',
  TICKET_DELETE: 'ticket:delete',

  // Agents
  AGENT_LIST: 'agent:list',
  AGENT_GET: 'agent:get',
  AGENT_CREATE: 'agent:create',
  AGENT_UPDATE: 'agent:update',

  // Scratch Orgs
  ORG_LIST: 'org:list',
  ORG_CLAIM: 'org:claim',
  ORG_RELEASE: 'org:release',

  // Chat
  CHAT_HISTORY: 'chat:history',
  CHAT_SEND: 'chat:send',
  CHAT_ON_MESSAGE: 'chat:on-message',

  // Runs & Analytics
  RUN_LIST: 'run:list',
  RUN_GET: 'run:get',
  RUN_CURRENT: 'run:current',

  // Agent state changes (main → renderer push)
  AGENT_STATUS_CHANGED: 'agent:status-changed',
  AGENT_TERMINAL_DATA: 'agent:terminal-data',
} as const;
```

### 4. Database Service (`src/main/services/database.ts`)

- Initialize SQLite database at `~/.sweatshop/sweatshop.db`
- Create tables on first run (use `IF NOT EXISTS`)
- Enable WAL mode for concurrent read performance
- Provide typed CRUD methods for each entity

**Tables:**

```sql
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
  run_id TEXT NOT NULL,
  prompt_text TEXT NOT NULL,
  created_at TEXT NOT NULL
);
```

**Service methods:**
- `listTickets(filter?: { status?: TicketStatus }): Ticket[]`
- `getTicket(id: string): Ticket | null`
- `createTicket(data: Omit<Ticket, 'id' | 'createdAt' | 'updatedAt'>): Ticket`
- `updateTicket(id: string, data: Partial<Ticket>): Ticket`
- `deleteTicket(id: string): void`
- Similar CRUD for agents, orgs, chat messages, runs
- `incrementIntervention(runId: string, event: InterventionEvent): void`

### 5. IPC Handlers (`src/main/ipc-handlers.ts`)

Register `ipcMain.handle()` for each channel. Each handler calls the database service.

Example:
```ts
ipcMain.handle(IPC_CHANNELS.TICKET_LIST, async (_, filter) => {
  return db.listTickets(filter);
});
```

### 6. Preload Bridge (`src/main/preload.ts`)

Expose typed IPC invoke methods via `contextBridge`:

```ts
contextBridge.exposeInMainWorld('sweatshop', {
  // ... existing version info ...

  tickets: {
    list: (filter?) => ipcRenderer.invoke(IPC_CHANNELS.TICKET_LIST, filter),
    get: (id) => ipcRenderer.invoke(IPC_CHANNELS.TICKET_GET, id),
    create: (data) => ipcRenderer.invoke(IPC_CHANNELS.TICKET_CREATE, data),
    update: (id, data) => ipcRenderer.invoke(IPC_CHANNELS.TICKET_UPDATE, id, data),
    delete: (id) => ipcRenderer.invoke(IPC_CHANNELS.TICKET_DELETE, id),
  },
  agents: {
    list: () => ipcRenderer.invoke(IPC_CHANNELS.AGENT_LIST),
    get: (id) => ipcRenderer.invoke(IPC_CHANNELS.AGENT_GET, id),
    create: (data) => ipcRenderer.invoke(IPC_CHANNELS.AGENT_CREATE, data),
    update: (id, data) => ipcRenderer.invoke(IPC_CHANNELS.AGENT_UPDATE, id, data),
  },
  orgs: {
    list: () => ipcRenderer.invoke(IPC_CHANNELS.ORG_LIST),
    claim: (agentId) => ipcRenderer.invoke(IPC_CHANNELS.ORG_CLAIM, agentId),
    release: (orgId) => ipcRenderer.invoke(IPC_CHANNELS.ORG_RELEASE, orgId),
  },
  chat: {
    history: (agentId) => ipcRenderer.invoke(IPC_CHANNELS.CHAT_HISTORY, agentId),
    send: (agentId, content) => ipcRenderer.invoke(IPC_CHANNELS.CHAT_SEND, agentId, content),
    onMessage: (callback) => ipcRenderer.on(IPC_CHANNELS.CHAT_ON_MESSAGE, (_, msg) => callback(msg)),
  },
  runs: {
    list: (ticketId?) => ipcRenderer.invoke(IPC_CHANNELS.RUN_LIST, ticketId),
    get: (id) => ipcRenderer.invoke(IPC_CHANNELS.RUN_GET, id),
    current: (agentId) => ipcRenderer.invoke(IPC_CHANNELS.RUN_CURRENT, agentId),
  },
});
```

### 7. Type-Safe Window Declaration

In `src/shared/types.ts` or a separate `src/renderer/global.d.ts`, declare the `window.sweatshop` type so the renderer has full IntelliSense.

## Acceptance Criteria

1. `npm run build` succeeds
2. On first launch, `~/.sweatshop/sweatshop.db` is created with all tables
3. Renderer can call `window.sweatshop.tickets.create(...)` and get back a typed `Ticket` object
4. Renderer can call `window.sweatshop.tickets.list()` and get back an array
5. No TypeScript errors
6. Database persists across app restarts
