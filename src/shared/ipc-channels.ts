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
  AGENT_ASSIGN: 'agent:assign',
  AGENT_APPROVE: 'agent:approve',
  AGENT_REJECT: 'agent:reject',
  AGENT_STOP: 'agent:stop',

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

  // Story generation
  STORY_GENERATE: 'story:generate',

  // Deathmark
  DEATHMARK_TEST_CONNECTION: 'deathmark:test-connection',
  DEATHMARK_SYNC: 'deathmark:sync',

  // Settings
  SETTINGS_GET: 'settings:get',
  SETTINGS_UPDATE: 'settings:update',

  // Orchestrator
  ORCHESTRATOR_LOAD: 'orchestrator:load',
  ORCHESTRATOR_START: 'orchestrator:start',
  ORCHESTRATOR_STOP: 'orchestrator:stop',
  ORCHESTRATOR_STATUS: 'orchestrator:status',
  ORCHESTRATOR_PROGRESS: 'orchestrator:progress',

  // Agent state changes (main → renderer push)
  AGENT_STATUS_CHANGED: 'agent:status-changed',
  AGENT_TERMINAL_DATA: 'agent:terminal-data',
} as const;
