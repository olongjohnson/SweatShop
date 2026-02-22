// ===== Conscript States =====

export type ConscriptStatus =
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

// ===== Directive Types =====

export type DirectiveSource = 'manual' | 'deathmark';

export type DirectiveStatus =
  | 'backlog'
  | 'ready'
  | 'in_progress'
  | 'qa_review'
  | 'approved'
  | 'merged'
  | 'rejected';

export interface Directive {
  id: string;
  externalId?: string;
  source: DirectiveSource;
  title: string;
  description: string;
  acceptanceCriteria: string;
  labels: string[];
  priority: 'low' | 'medium' | 'high' | 'critical';
  status: DirectiveStatus;
  dependsOn: string[];
  assignedConscriptId?: string;
  workflowTemplateId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Conscript {
  id: string;
  name: string;
  status: ConscriptStatus;
  assignedDirectiveId?: string;
  assignedCampAliases: string[];
  branchName?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Camp {
  id: string;
  alias: string;
  status: 'available' | 'leased' | 'expired' | 'error';
  assignedConscriptIds: string[];
  loginUrl?: string;
  expiresAt?: string;
  createdAt: string;
  updatedAt: string;
  campId?: string;
  username?: string;
  edition?: string;
  instanceUrl?: string;
  devHubAlias?: string;
  namespace?: string;
}

export interface DevHubInfo {
  devHub: {
    alias: string;
    name: string;
    connected: boolean;
    instanceUrl: string;
  } | null;
  limits: {
    activeScratchOrgs: { used: number; max: number };
    dailyScratchOrgs: { used: number; max: number };
  };
  camps: Camp[];
}

export interface ChatMessage {
  id: string;
  conscriptId: string;
  role: 'conscript' | 'user' | 'system';
  content: string;
  timestamp: string;
}

export interface QaChecklistItem {
  id: string;
  label: string;
  checked: boolean;
}

export interface DirectiveRun {
  id: string;
  directiveId: string;
  conscriptId: string;
  campAlias?: string;
  branchName?: string;
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  startedAt: string;
  completedAt?: string;
  humanInterventionCount: number;
  reworkCount: number;
  promptTokensUsed: number;
  completionTokensUsed: number;
  interventions: InterventionEvent[];
  qaChecklist?: QaChecklistItem[];
}

export interface InterventionEvent {
  timestamp: string;
  type: 'question' | 'rework' | 'guidance' | 'error_recovery';
  conscriptMessage: string;
  humanResponse?: string;
  waitDurationMs: number;
}

export interface RefinedPrompt {
  id: string;
  directiveId: string;
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

// ===== Analytics =====

export interface RunMetrics {
  directiveId: string;
  conscriptId: string;
  status: string;
  startedAt: string;
  completedAt?: string;
  wallClockDurationMs: number;
  activeDevTimeMs: number;
  humanWaitTimeMs: number;
  humanInterventionCount: number;
  reworkCount: number;
  promptTokensUsed: number;
  completionTokensUsed: number;
  estimatedCostUsd: number;
  autonomyScore: number;
}

export interface ConscriptMetrics {
  conscriptId: string;
  conscriptName: string;
  directivesCompleted: number;
  avgInterventionsPerDirective: number;
  avgReworkRate: number;
  avgDurationMs: number;
  totalTokensUsed: number;
  totalEstimatedCostUsd: number;
}

export interface SessionMetrics {
  totalDirectives: number;
  completedDirectives: number;
  failedDirectives: number;
  totalSessionTimeMs: number;
  totalHumanWaitTimeMs: number;
  totalActiveDevTimeMs: number;
  totalInterventions: number;
  totalReworks: number;
  firstPassApprovalRate: number;
  autonomyScore: number;
  velocity: number;
  humanEfficiencyRatio: number;
  totalCostUsd: number;
  costPerDirectiveUsd: number;
}

export interface TrendPoint {
  period: string;
  value: number;
}

// ===== Identity Templates =====

export interface IdentityTemplate {
  id: string;
  name: string;
  role: string;
  goal: string;
  backstory: string;
  portrait: string | null;
  systemPrompt: string;
  model: 'sonnet' | 'opus' | 'haiku';
  effort: 'low' | 'medium' | 'high' | 'max';
  maxTurns: number | null;
  maxBudgetUsd: number | null;
  allowedTools: string[];
  disallowedTools: string[];
  createdAt: string;
  updatedAt: string;
}

// ===== Workflow Templates =====

export type WorkflowStageType = 'refine' | 'execute' | 'review' | 'human';

export interface WorkflowStage {
  id: string;
  identityTemplateId: string | null;
  order: number;
  type: WorkflowStageType;
  inputDescription: string;
  outputDescription: string;
}

export interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  stages: WorkflowStage[];
  createdAt: string;
  updatedAt: string;
}

// ===== Pipeline Runs =====

export interface PipelineStageOutput {
  stageId: string;
  stageType: WorkflowStageType;
  identityName: string;
  output: string;
  startedAt: string;
  completedAt: string;
}

export interface PipelineRun {
  id: string;
  directiveId: string;
  workflowTemplateId: string;
  status: 'running' | 'paused' | 'completed' | 'failed';
  currentStageIndex: number;
  stageOutputs: PipelineStageOutput[];
  createdAt: string;
  updatedAt: string;
}

// ===== Notifications =====

export interface ConscriptNotification {
  conscriptId: string;
  conscriptName: string;
  status: ConscriptStatus;
  event?: 'merged';
  directiveTitle?: string;
}

// ===== LWC Preview =====

export interface LwcPreviewStatus {
  conscriptId: string;
  status: 'starting' | 'running' | 'error' | 'stopped';
  previewUrl?: string;
  componentName?: string;
  error?: string;
  exitCode?: number;
}

export interface LwcPreviewSession {
  status: 'starting' | 'running' | 'error' | 'stopped';
  previewUrl: string | null;
  componentName: string;
}

// ===== Preload API =====

export interface SweatShopAPI {
  platform: string;
  versions: {
    chrome: string;
    node: string;
    electron: string;
  };
  directives: {
    list: (filter?: { status?: DirectiveStatus }) => Promise<Directive[]>;
    get: (id: string) => Promise<Directive | null>;
    create: (data: Omit<Directive, 'id' | 'createdAt' | 'updatedAt'>) => Promise<Directive>;
    update: (id: string, data: Partial<Directive>) => Promise<Directive>;
    delete: (id: string) => Promise<void>;
  };
  conscripts: {
    list: () => Promise<Conscript[]>;
    get: (id: string) => Promise<Conscript | null>;
    create: (data: { name: string }) => Promise<Conscript>;
    update: (id: string, data: Partial<Conscript>) => Promise<Conscript>;
    assign: (conscriptId: string, directiveId: string, config: {
      campAlias: string;
      branchName: string;
      refinedPrompt: string;
      workingDirectory: string;
    }) => Promise<void>;
    approve: (conscriptId: string) => Promise<void>;
    reject: (conscriptId: string, feedback: string) => Promise<void>;
    stop: (conscriptId: string) => Promise<void>;
    scrap: (conscriptId: string) => Promise<void>;
    retry: (conscriptId: string) => Promise<void>;
    delete: (conscriptId: string) => Promise<void>;
    onStatusChanged: (callback: (data: { conscriptId: string; status: ConscriptStatus }) => void) => void;
    onTerminalData: (callback: (data: { conscriptId: string; data: string }) => void) => void;
    onNotification: (callback: (data: ConscriptNotification) => void) => void;
  };
  camps: {
    list: () => Promise<Camp[]>;
    claim: (conscriptId: string) => Promise<Camp | null>;
    release: (campId: string) => Promise<void>;
    getStatus: () => Promise<{ total: number; available: number; leased: number; expired: number }>;
    discover: () => Promise<Camp[]>;
    register: (alias: string) => Promise<Camp>;
    remove: (campId: string) => Promise<void>;
    createScratch: (alias?: string) => Promise<Camp | null>;
    provision: (alias?: string) => Promise<Camp | null>;
    onProvisionOutput: (callback: (data: { data: string }) => void) => void;
    getDevHubInfo: () => Promise<DevHubInfo>;
    sync: () => Promise<Camp[]>;
    deleteCamp: (alias: string) => Promise<void>;
    openCamp: (alias: string) => Promise<string>;
    openDevHub: () => Promise<string>;
    assignToConscript: (campId: string, conscriptId: string) => Promise<void>;
    unassignFromConscript: (campId: string, conscriptId: string) => Promise<void>;
  };
  chat: {
    history: (conscriptId: string) => Promise<ChatMessage[]>;
    send: (conscriptId: string, content: string) => Promise<ChatMessage>;
    onMessage: (callback: (msg: ChatMessage) => void) => void;
  };
  runs: {
    list: (directiveId?: string) => Promise<DirectiveRun[]>;
    get: (id: string) => Promise<DirectiveRun | null>;
    current: (conscriptId: string) => Promise<DirectiveRun | null>;
    getQaChecklist: (conscriptId: string) => Promise<QaChecklistItem[]>;
    updateQaChecklist: (conscriptId: string, checklist: QaChecklistItem[]) => Promise<void>;
  };
  stories: {
    generate: (input: { freeformInput: string }) => Promise<{
      title: string;
      description: string;
      acceptanceCriteria: string;
      priority: 'low' | 'medium' | 'high' | 'critical';
      suggestedLabels: string[];
    }>;
  };
  orchestrator: {
    loadDirectives: (directiveIds: string[]) => Promise<void>;
    start: () => Promise<void>;
    stop: () => Promise<void>;
    getStatus: () => Promise<OrchestratorStatus>;
    onProgress: (callback: (status: OrchestratorStatus) => void) => void;
  };
  git: {
    validate: (dir: string) => Promise<{ valid: boolean; error?: string }>;
    getModifiedFiles: (conscriptId: string) => Promise<string[]>;
    getDiffSummary: (conscriptId: string) => Promise<{ filesChanged: number; insertions: number; deletions: number }>;
    getFullDiff: (conscriptId: string) => Promise<string>;
    getFileDiff: (conscriptId: string, filePath: string) => Promise<string>;
    getFilesWithStats: (conscriptId: string) => Promise<Array<{ path: string; insertions: number; deletions: number }>>;
    getCommitLog: (conscriptId: string) => Promise<Array<{ hash: string; shortHash: string; subject: string; author: string; date: string }>>;
  };
  browser: {
    loadURL: (conscriptId: string, url: string) => Promise<void>;
    setBounds: (conscriptId: string, bounds: { x: number; y: number; width: number; height: number }) => Promise<void>;
    back: (conscriptId: string) => Promise<void>;
    forward: (conscriptId: string) => Promise<void>;
    reload: (conscriptId: string) => Promise<void>;
    getURL: (conscriptId: string) => Promise<string>;
    show: (conscriptId: string, bounds: { x: number; y: number; width: number; height: number }) => Promise<void>;
    hideAll: () => Promise<void>;
    createLocalPreview: (viewId: string) => Promise<void>;
    loadLocalURL: (viewId: string, url: string) => Promise<void>;
  };
  lwcPreview: {
    detect: (conscriptId: string) => Promise<string[]>;
    start: (conscriptId: string, componentName: string) => Promise<string>;
    stop: (conscriptId: string) => Promise<void>;
    getSession: (conscriptId: string) => Promise<LwcPreviewSession | null>;
    onStatus: (callback: (data: LwcPreviewStatus) => void) => void;
    onOutput: (callback: (data: { conscriptId: string; data: string }) => void) => void;
  };
  deathmark: {
    testConnection: () => Promise<{ success: boolean; error?: string }>;
    sync: () => Promise<Directive[]>;
  };
  claude: {
    authStatus: () => Promise<{ authenticated: boolean; method: string; error?: string }>;
    login: () => Promise<{ success: boolean; error?: string }>;
    onLoginOutput: (callback: (data: { text: string; done: boolean }) => void) => void;
  };
  settings: {
    get: () => Promise<SweatShopSettings>;
    update: (data: Partial<SweatShopSettings>) => Promise<SweatShopSettings>;
    pickDirectory: () => Promise<string | null>;
    pickFile: (filters?: Array<{ name: string; extensions: string[] }>) => Promise<string | null>;
  };
  identities: {
    generate: (input: { freeformInput: string }) => Promise<{
      name: string; role: string; goal: string; backstory: string; systemPrompt: string;
      model: 'sonnet' | 'opus' | 'haiku'; effort: 'low' | 'medium' | 'high' | 'max';
      allowedTools: string[]; disallowedTools: string[];
    }>;
    list: () => Promise<IdentityTemplate[]>;
    get: (id: string) => Promise<IdentityTemplate | null>;
    create: (data: Omit<IdentityTemplate, 'id' | 'createdAt' | 'updatedAt'>) => Promise<IdentityTemplate>;
    update: (id: string, data: Partial<IdentityTemplate>) => Promise<IdentityTemplate>;
    delete: (id: string) => Promise<void>;
  };
  workflows: {
    generate: (input: {
      freeformInput: string;
      availableIdentities: Array<{ id: string; name: string; role: string }>;
    }) => Promise<{
      name: string;
      description: string;
      stages: Array<{
        type: WorkflowStageType; identityTemplateId: string | null;
        inputDescription: string; outputDescription: string;
      }>;
    }>;
    list: () => Promise<WorkflowTemplate[]>;
    get: (id: string) => Promise<WorkflowTemplate | null>;
    create: (data: Omit<WorkflowTemplate, 'id' | 'createdAt' | 'updatedAt'>) => Promise<WorkflowTemplate>;
    update: (id: string, data: Partial<WorkflowTemplate>) => Promise<WorkflowTemplate>;
    delete: (id: string) => Promise<void>;
  };
  pipeline: {
    getRunForDirective: (directiveId: string) => Promise<PipelineRun | null>;
    resumeHumanStage: (pipelineRunId: string, input: string) => Promise<void>;
    onStageComplete: (callback: (data: { directiveId: string; stageIndex: number; total: number }) => void) => void;
  };
  analytics: {
    getRunMetrics: (runId: string) => Promise<RunMetrics | null>;
    getConscriptMetrics: (conscriptId: string) => Promise<ConscriptMetrics>;
    getSessionMetrics: (options?: { since?: string }) => Promise<SessionMetrics>;
    getTrend: (metric: string, options: { period: 'day' | 'week'; count: number }) => Promise<TrendPoint[]>;
    export: (options?: { since?: string }) => Promise<string>;
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
  campPool?: {
    maxCamps: number;
    scratchDefPath: string;
    defaultDurationDays: number;
    dataPlanPath?: string;
    permissionSets?: string[];
    openPath?: string;
    allowSharedCamps?: boolean;
    maxConscriptsPerCamp?: number;
  };
}

declare global {
  interface Window {
    sweatshop: SweatShopAPI;
  }
}
