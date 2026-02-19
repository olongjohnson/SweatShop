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
