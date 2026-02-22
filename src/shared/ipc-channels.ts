export const IPC_CHANNELS = {
  // Directives
  DIRECTIVE_LIST: 'directive:list',
  DIRECTIVE_GET: 'directive:get',
  DIRECTIVE_CREATE: 'directive:create',
  DIRECTIVE_UPDATE: 'directive:update',
  DIRECTIVE_DELETE: 'directive:delete',

  // Conscripts
  CONSCRIPT_LIST: 'conscript:list',
  CONSCRIPT_GET: 'conscript:get',
  CONSCRIPT_CREATE: 'conscript:create',
  CONSCRIPT_UPDATE: 'conscript:update',
  CONSCRIPT_ASSIGN: 'conscript:assign',
  CONSCRIPT_APPROVE: 'conscript:approve',
  CONSCRIPT_REJECT: 'conscript:reject',
  CONSCRIPT_STOP: 'conscript:stop',
  CONSCRIPT_SCRAP: 'conscript:scrap',
  CONSCRIPT_DELETE: 'conscript:delete',

  // Camps
  CAMP_LIST: 'camp:list',
  CAMP_CLAIM: 'camp:claim',
  CAMP_RELEASE: 'camp:release',
  CAMP_STATUS: 'camp:status',
  CAMP_DISCOVER: 'camp:discover',
  CAMP_REGISTER: 'camp:register',
  CAMP_REMOVE: 'camp:remove',
  CAMP_CREATE_SCRATCH: 'camp:create-scratch',
  CAMP_PROVISION: 'camp:provision',
  CAMP_PROVISION_OUTPUT: 'camp:provision-output',
  CAMP_DEVHUB_INFO: 'camp:devhub-info',
  CAMP_SYNC: 'camp:sync',
  CAMP_DELETE: 'camp:delete',
  CAMP_OPEN: 'camp:open',
  CAMP_OPEN_DEVHUB: 'camp:open-devhub',
  CAMP_ASSIGN: 'camp:assign-to-conscript',
  CAMP_UNASSIGN: 'camp:unassign-from-conscript',

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
  SETTINGS_PICK_DIRECTORY: 'settings:pick-directory',
  SETTINGS_PICK_FILE: 'settings:pick-file',

  // Claude Code
  CLAUDE_AUTH_STATUS: 'claude:auth-status',
  CLAUDE_AUTH_LOGIN: 'claude:auth-login',
  CLAUDE_AUTH_LOGIN_OUTPUT: 'claude:auth-login-output',

  // Orchestrator
  ORCHESTRATOR_LOAD: 'orchestrator:load',
  ORCHESTRATOR_START: 'orchestrator:start',
  ORCHESTRATOR_STOP: 'orchestrator:stop',
  ORCHESTRATOR_STATUS: 'orchestrator:status',
  ORCHESTRATOR_PROGRESS: 'orchestrator:progress',

  // Git
  GIT_VALIDATE: 'git:validate',
  GIT_MODIFIED_FILES: 'git:modified-files',
  GIT_DIFF_SUMMARY: 'git:diff-summary',
  GIT_FULL_DIFF: 'git:full-diff',
  GIT_FILE_DIFF: 'git:file-diff',
  GIT_FILES_WITH_STATS: 'git:files-with-stats',
  GIT_COMMIT_LOG: 'git:commit-log',

  // Browser
  BROWSER_LOAD_URL: 'browser:load-url',
  BROWSER_SET_BOUNDS: 'browser:set-bounds',
  BROWSER_BACK: 'browser:back',
  BROWSER_FORWARD: 'browser:forward',
  BROWSER_RELOAD: 'browser:reload',
  BROWSER_GET_URL: 'browser:get-url',
  BROWSER_SHOW: 'browser:show',
  BROWSER_HIDE_ALL: 'browser:hide-all',
  BROWSER_CREATE_LOCAL_PREVIEW: 'browser:create-local-preview',
  BROWSER_LOAD_LOCAL_URL: 'browser:load-local-url',

  // LWC Preview
  LWC_PREVIEW_DETECT: 'lwc-preview:detect',
  LWC_PREVIEW_START: 'lwc-preview:start',
  LWC_PREVIEW_STOP: 'lwc-preview:stop',
  LWC_PREVIEW_STATUS: 'lwc-preview:status',
  LWC_PREVIEW_OUTPUT: 'lwc-preview:output',
  LWC_PREVIEW_GET_SESSION: 'lwc-preview:get-session',

  // Analytics
  ANALYTICS_RUN: 'analytics:run',
  ANALYTICS_CONSCRIPT: 'analytics:conscript',
  ANALYTICS_SESSION: 'analytics:session',
  ANALYTICS_TREND: 'analytics:trend',
  ANALYTICS_EXPORT: 'analytics:export',

  // Identity Templates
  IDENTITY_GENERATE: 'identity:generate',
  IDENTITY_LIST: 'identity:list',
  IDENTITY_GET: 'identity:get',
  IDENTITY_CREATE: 'identity:create',
  IDENTITY_UPDATE: 'identity:update',
  IDENTITY_DELETE: 'identity:delete',

  // Workflow Templates
  WORKFLOW_GENERATE: 'workflow:generate',
  WORKFLOW_LIST: 'workflow:list',
  WORKFLOW_GET: 'workflow:get',
  WORKFLOW_CREATE: 'workflow:create',
  WORKFLOW_UPDATE: 'workflow:update',
  WORKFLOW_DELETE: 'workflow:delete',

  // Pipeline
  PIPELINE_GET_RUN: 'pipeline:getRun',
  PIPELINE_RESUME_HUMAN: 'pipeline:resumeHuman',
  PIPELINE_STAGE_COMPLETE: 'pipeline:stageComplete',

  // Conscript state changes (main → renderer push)
  CONSCRIPT_STATUS_CHANGED: 'conscript:status-changed',
  CONSCRIPT_TERMINAL_DATA: 'conscript:terminal-data',
  CONSCRIPT_NOTIFICATION: 'conscript:notification',
} as const;
