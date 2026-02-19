// ===== Agent States =====

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

// ===== Ticket Types =====

export type TicketSource = 'manual' | 'deathmark';

export type TicketStatus =
  | 'backlog'
  | 'ready'
  | 'in_progress'
  | 'qa_review'
  | 'approved'
  | 'merged'
  | 'rejected';

export interface Ticket {
  id: string;
  externalId?: string;
  source: TicketSource;
  title: string;
  description: string;
  acceptanceCriteria: string;
  labels: string[];
  priority: 'low' | 'medium' | 'high' | 'critical';
  status: TicketStatus;
  dependsOn: string[];
  assignedAgentId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Agent {
  id: string;
  name: string;
  status: AgentStatus;
  assignedTicketId?: string;
  assignedOrgAlias?: string;
  branchName?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ScratchOrg {
  id: string;
  alias: string;
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
  id: string;
  ticketId: string;
  agentId: string;
  orgAlias?: string;
  branchName?: string;
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  startedAt: string;
  completedAt?: string;
  humanInterventionCount: number;
  reworkCount: number;
  promptTokensUsed: number;
  completionTokensUsed: number;
  interventions: InterventionEvent[];
}

export interface InterventionEvent {
  timestamp: string;
  type: 'question' | 'rework' | 'guidance' | 'error_recovery';
  agentMessage: string;
  humanResponse?: string;
  waitDurationMs: number;
}

export interface RefinedPrompt {
  id: string;
  ticketId: string;
  runId: string;
  promptText: string;
  createdAt: string;
}

// ===== Orchestrator =====

export interface OrchestratorStatus {
  running: boolean;
  total: number;
  pending: number;
  inProgress: number;
  completed: number;
}

// ===== Notifications =====

export interface AgentNotification {
  agentId: string;
  agentName: string;
  status: AgentStatus;
  event?: 'merged';
  ticketTitle?: string;
}

// ===== Preload API =====

export interface SweatShopAPI {
  platform: string;
  versions: {
    chrome: string;
    node: string;
    electron: string;
  };
  tickets: {
    list: (filter?: { status?: TicketStatus }) => Promise<Ticket[]>;
    get: (id: string) => Promise<Ticket | null>;
    create: (data: Omit<Ticket, 'id' | 'createdAt' | 'updatedAt'>) => Promise<Ticket>;
    update: (id: string, data: Partial<Ticket>) => Promise<Ticket>;
    delete: (id: string) => Promise<void>;
  };
  agents: {
    list: () => Promise<Agent[]>;
    get: (id: string) => Promise<Agent | null>;
    create: (data: { name: string }) => Promise<Agent>;
    update: (id: string, data: Partial<Agent>) => Promise<Agent>;
    assign: (agentId: string, ticketId: string, config: {
      orgAlias: string;
      branchName: string;
      refinedPrompt: string;
      workingDirectory: string;
    }) => Promise<void>;
    approve: (agentId: string) => Promise<void>;
    reject: (agentId: string, feedback: string) => Promise<void>;
    stop: (agentId: string) => Promise<void>;
    onStatusChanged: (callback: (data: { agentId: string; status: AgentStatus }) => void) => void;
    onTerminalData: (callback: (data: { agentId: string; data: string }) => void) => void;
    onNotification: (callback: (data: AgentNotification) => void) => void;
  };
  orgs: {
    list: () => Promise<ScratchOrg[]>;
    claim: (agentId: string) => Promise<ScratchOrg | null>;
    release: (orgId: string) => Promise<void>;
    getStatus: () => Promise<{ total: number; available: number; leased: number; expired: number }>;
    discover: () => Promise<ScratchOrg[]>;
    register: (alias: string) => Promise<ScratchOrg>;
    remove: (orgId: string) => Promise<void>;
  };
  chat: {
    history: (agentId: string) => Promise<ChatMessage[]>;
    send: (agentId: string, content: string) => Promise<ChatMessage>;
    onMessage: (callback: (msg: ChatMessage) => void) => void;
  };
  runs: {
    list: (ticketId?: string) => Promise<TicketRun[]>;
    get: (id: string) => Promise<TicketRun | null>;
    current: (agentId: string) => Promise<TicketRun | null>;
  };
  stories: {
    generate: (input: { title: string; description?: string; projectContext?: string }) => Promise<{
      description: string;
      acceptanceCriteria: string;
      suggestedLabels: string[];
    }>;
  };
  orchestrator: {
    loadTickets: (ticketIds: string[]) => Promise<void>;
    start: () => Promise<void>;
    stop: () => Promise<void>;
    getStatus: () => Promise<OrchestratorStatus>;
    onProgress: (callback: (status: OrchestratorStatus) => void) => void;
  };
  git: {
    validate: (dir: string) => Promise<{ valid: boolean; error?: string }>;
    getModifiedFiles: (agentId: string) => Promise<string[]>;
    getDiffSummary: (agentId: string) => Promise<{ filesChanged: number; insertions: number; deletions: number }>;
  };
  browser: {
    loadURL: (agentId: string, url: string) => Promise<void>;
    setBounds: (agentId: string, bounds: { x: number; y: number; width: number; height: number }) => Promise<void>;
    back: (agentId: string) => Promise<void>;
    forward: (agentId: string) => Promise<void>;
    reload: (agentId: string) => Promise<void>;
    getURL: (agentId: string) => Promise<string>;
    show: (agentId: string, bounds: { x: number; y: number; width: number; height: number }) => Promise<void>;
    hideAll: () => Promise<void>;
  };
  deathmark: {
    testConnection: () => Promise<{ success: boolean; error?: string }>;
    sync: () => Promise<Ticket[]>;
  };
  settings: {
    get: () => Promise<SweatShopSettings>;
    update: (data: Partial<SweatShopSettings>) => Promise<SweatShopSettings>;
  };
}

// ===== Settings =====

export interface SweatShopSettings {
  anthropicApiKey?: string;
  deathmark?: {
    instanceUrl: string;
    accessToken?: string;
    refreshToken?: string;
    clientId?: string;
    clientSecret?: string;
    objectName: string;
    fieldMapping: {
      title: string;
      description: string;
      acceptanceCriteria: string;
      priority: string;
      status: string;
      labels: string;
    };
  };
  git?: {
    baseBranch: string;
    mergeStrategy: 'squash' | 'merge';
    workingDirectory: string;
  };
  orgPool?: {
    maxOrgs: number;
    scratchDefPath: string;
    defaultDurationDays: number;
    dataPlanPath?: string;
    permissionSets?: string[];
  };
}

declare global {
  interface Window {
    sweatshop: SweatShopAPI;
  }
}
