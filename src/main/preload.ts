import { contextBridge, ipcRenderer } from 'electron';
import { IPC_CHANNELS } from '../shared/ipc-channels';
import type { SweatShopAPI } from '../shared/types';

const api: SweatShopAPI = {
  platform: process.platform,
  versions: {
    chrome: process.versions.chrome ?? 'unknown',
    node: process.versions.node ?? 'unknown',
    electron: process.versions.electron ?? 'unknown',
  },

  directives: {
    list: (filter?) => ipcRenderer.invoke(IPC_CHANNELS.DIRECTIVE_LIST, filter),
    get: (id) => ipcRenderer.invoke(IPC_CHANNELS.DIRECTIVE_GET, id),
    create: (data) => ipcRenderer.invoke(IPC_CHANNELS.DIRECTIVE_CREATE, data),
    update: (id, data) => ipcRenderer.invoke(IPC_CHANNELS.DIRECTIVE_UPDATE, id, data),
    delete: (id) => ipcRenderer.invoke(IPC_CHANNELS.DIRECTIVE_DELETE, id),
  },

  conscripts: {
    list: () => ipcRenderer.invoke(IPC_CHANNELS.CONSCRIPT_LIST),
    get: (id) => ipcRenderer.invoke(IPC_CHANNELS.CONSCRIPT_GET, id),
    create: (data) => ipcRenderer.invoke(IPC_CHANNELS.CONSCRIPT_CREATE, data),
    update: (id, data) => ipcRenderer.invoke(IPC_CHANNELS.CONSCRIPT_UPDATE, id, data),
    assign: (conscriptId, directiveId, config) =>
      ipcRenderer.invoke(IPC_CHANNELS.CONSCRIPT_ASSIGN, conscriptId, directiveId, config),
    approve: (conscriptId) => ipcRenderer.invoke(IPC_CHANNELS.CONSCRIPT_APPROVE, conscriptId),
    reject: (conscriptId, feedback) =>
      ipcRenderer.invoke(IPC_CHANNELS.CONSCRIPT_REJECT, conscriptId, feedback),
    stop: (conscriptId) => ipcRenderer.invoke(IPC_CHANNELS.CONSCRIPT_STOP, conscriptId),
    scrap: (conscriptId) => ipcRenderer.invoke(IPC_CHANNELS.CONSCRIPT_SCRAP, conscriptId),
    delete: (conscriptId) => ipcRenderer.invoke(IPC_CHANNELS.CONSCRIPT_DELETE, conscriptId),
    onStatusChanged: (callback) => {
      ipcRenderer.on(IPC_CHANNELS.CONSCRIPT_STATUS_CHANGED, (_, data) => callback(data));
    },
    onTerminalData: (callback) => {
      ipcRenderer.on(IPC_CHANNELS.CONSCRIPT_TERMINAL_DATA, (_, data) => callback(data));
    },
    onNotification: (callback) => {
      ipcRenderer.on(IPC_CHANNELS.CONSCRIPT_NOTIFICATION, (_, data) => callback(data));
    },
  },

  camps: {
    list: () => ipcRenderer.invoke(IPC_CHANNELS.CAMP_LIST),
    claim: (conscriptId) => ipcRenderer.invoke(IPC_CHANNELS.CAMP_CLAIM, conscriptId),
    release: (campId) => ipcRenderer.invoke(IPC_CHANNELS.CAMP_RELEASE, campId),
    getStatus: () => ipcRenderer.invoke(IPC_CHANNELS.CAMP_STATUS),
    discover: () => ipcRenderer.invoke(IPC_CHANNELS.CAMP_DISCOVER),
    register: (alias) => ipcRenderer.invoke(IPC_CHANNELS.CAMP_REGISTER, alias),
    remove: (campId) => ipcRenderer.invoke(IPC_CHANNELS.CAMP_REMOVE, campId),
    createScratch: (alias?) => ipcRenderer.invoke(IPC_CHANNELS.CAMP_CREATE_SCRATCH, alias),
    provision: (alias?) => ipcRenderer.invoke(IPC_CHANNELS.CAMP_PROVISION, alias),
    onProvisionOutput: (callback) => {
      ipcRenderer.on(IPC_CHANNELS.CAMP_PROVISION_OUTPUT, (_, data) => callback(data));
    },
    getDevHubInfo: () => ipcRenderer.invoke(IPC_CHANNELS.CAMP_DEVHUB_INFO),
    sync: () => ipcRenderer.invoke(IPC_CHANNELS.CAMP_SYNC),
    deleteCamp: (alias) => ipcRenderer.invoke(IPC_CHANNELS.CAMP_DELETE, alias),
    openCamp: (alias) => ipcRenderer.invoke(IPC_CHANNELS.CAMP_OPEN, alias),
    openDevHub: () => ipcRenderer.invoke(IPC_CHANNELS.CAMP_OPEN_DEVHUB),
    assignToConscript: (campId, conscriptId) => ipcRenderer.invoke(IPC_CHANNELS.CAMP_ASSIGN, campId, conscriptId),
    unassignFromConscript: (campId, conscriptId) => ipcRenderer.invoke(IPC_CHANNELS.CAMP_UNASSIGN, campId, conscriptId),
  },

  chat: {
    history: (conscriptId) => ipcRenderer.invoke(IPC_CHANNELS.CHAT_HISTORY, conscriptId),
    send: (conscriptId, content) => ipcRenderer.invoke(IPC_CHANNELS.CHAT_SEND, conscriptId, content),
    onMessage: (callback) => {
      ipcRenderer.on(IPC_CHANNELS.CHAT_ON_MESSAGE, (_, msg) => callback(msg));
    },
  },

  runs: {
    list: (directiveId?) => ipcRenderer.invoke(IPC_CHANNELS.RUN_LIST, directiveId),
    get: (id) => ipcRenderer.invoke(IPC_CHANNELS.RUN_GET, id),
    current: (conscriptId) => ipcRenderer.invoke(IPC_CHANNELS.RUN_CURRENT, conscriptId),
  },

  stories: {
    generate: (input) => ipcRenderer.invoke(IPC_CHANNELS.STORY_GENERATE, input),
  },

  orchestrator: {
    loadDirectives: (directiveIds) => ipcRenderer.invoke(IPC_CHANNELS.ORCHESTRATOR_LOAD, directiveIds),
    start: () => ipcRenderer.invoke(IPC_CHANNELS.ORCHESTRATOR_START),
    stop: () => ipcRenderer.invoke(IPC_CHANNELS.ORCHESTRATOR_STOP),
    getStatus: () => ipcRenderer.invoke(IPC_CHANNELS.ORCHESTRATOR_STATUS),
    onProgress: (callback) => {
      ipcRenderer.on(IPC_CHANNELS.ORCHESTRATOR_PROGRESS, (_, data) => callback(data));
    },
  },

  git: {
    validate: (dir) => ipcRenderer.invoke(IPC_CHANNELS.GIT_VALIDATE, dir),
    getModifiedFiles: (conscriptId) => ipcRenderer.invoke(IPC_CHANNELS.GIT_MODIFIED_FILES, conscriptId),
    getDiffSummary: (conscriptId) => ipcRenderer.invoke(IPC_CHANNELS.GIT_DIFF_SUMMARY, conscriptId),
    getFullDiff: (conscriptId) => ipcRenderer.invoke(IPC_CHANNELS.GIT_FULL_DIFF, conscriptId),
    getFileDiff: (conscriptId, filePath) => ipcRenderer.invoke(IPC_CHANNELS.GIT_FILE_DIFF, conscriptId, filePath),
    getFilesWithStats: (conscriptId) => ipcRenderer.invoke(IPC_CHANNELS.GIT_FILES_WITH_STATS, conscriptId),
    getCommitLog: (conscriptId) => ipcRenderer.invoke(IPC_CHANNELS.GIT_COMMIT_LOG, conscriptId),
  },

  browser: {
    loadURL: (conscriptId, url) => ipcRenderer.invoke(IPC_CHANNELS.BROWSER_LOAD_URL, conscriptId, url),
    setBounds: (conscriptId, bounds) => ipcRenderer.invoke(IPC_CHANNELS.BROWSER_SET_BOUNDS, conscriptId, bounds),
    back: (conscriptId) => ipcRenderer.invoke(IPC_CHANNELS.BROWSER_BACK, conscriptId),
    forward: (conscriptId) => ipcRenderer.invoke(IPC_CHANNELS.BROWSER_FORWARD, conscriptId),
    reload: (conscriptId) => ipcRenderer.invoke(IPC_CHANNELS.BROWSER_RELOAD, conscriptId),
    getURL: (conscriptId) => ipcRenderer.invoke(IPC_CHANNELS.BROWSER_GET_URL, conscriptId),
    show: (conscriptId, bounds) => ipcRenderer.invoke(IPC_CHANNELS.BROWSER_SHOW, conscriptId, bounds),
    hideAll: () => ipcRenderer.invoke(IPC_CHANNELS.BROWSER_HIDE_ALL),
    createLocalPreview: (viewId) => ipcRenderer.invoke(IPC_CHANNELS.BROWSER_CREATE_LOCAL_PREVIEW, viewId),
    loadLocalURL: (viewId, url) => ipcRenderer.invoke(IPC_CHANNELS.BROWSER_LOAD_LOCAL_URL, viewId, url),
  },

  lwcPreview: {
    detect: (conscriptId) => ipcRenderer.invoke(IPC_CHANNELS.LWC_PREVIEW_DETECT, conscriptId),
    start: (conscriptId, componentName) => ipcRenderer.invoke(IPC_CHANNELS.LWC_PREVIEW_START, conscriptId, componentName),
    stop: (conscriptId) => ipcRenderer.invoke(IPC_CHANNELS.LWC_PREVIEW_STOP, conscriptId),
    getSession: (conscriptId) => ipcRenderer.invoke(IPC_CHANNELS.LWC_PREVIEW_GET_SESSION, conscriptId),
    onStatus: (callback) => {
      ipcRenderer.on(IPC_CHANNELS.LWC_PREVIEW_STATUS, (_, data) => callback(data));
    },
    onOutput: (callback) => {
      ipcRenderer.on(IPC_CHANNELS.LWC_PREVIEW_OUTPUT, (_, data) => callback(data));
    },
  },

  deathmark: {
    testConnection: () => ipcRenderer.invoke(IPC_CHANNELS.DEATHMARK_TEST_CONNECTION),
    sync: () => ipcRenderer.invoke(IPC_CHANNELS.DEATHMARK_SYNC),
  },

  claude: {
    authStatus: () => ipcRenderer.invoke(IPC_CHANNELS.CLAUDE_AUTH_STATUS),
    login: () => ipcRenderer.invoke(IPC_CHANNELS.CLAUDE_AUTH_LOGIN),
    onLoginOutput: (callback) => {
      ipcRenderer.on(IPC_CHANNELS.CLAUDE_AUTH_LOGIN_OUTPUT, (_, data) => callback(data));
    },
  },

  settings: {
    get: () => ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_GET),
    update: (data) => ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_UPDATE, data),
    pickDirectory: () => ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_PICK_DIRECTORY),
    pickFile: (filters?) => ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_PICK_FILE, filters),
  },

  identities: {
    generate: (input) => ipcRenderer.invoke(IPC_CHANNELS.IDENTITY_GENERATE, input),
    list: () => ipcRenderer.invoke(IPC_CHANNELS.IDENTITY_LIST),
    get: (id) => ipcRenderer.invoke(IPC_CHANNELS.IDENTITY_GET, id),
    create: (data) => ipcRenderer.invoke(IPC_CHANNELS.IDENTITY_CREATE, data),
    update: (id, data) => ipcRenderer.invoke(IPC_CHANNELS.IDENTITY_UPDATE, id, data),
    delete: (id) => ipcRenderer.invoke(IPC_CHANNELS.IDENTITY_DELETE, id),
  },

  workflows: {
    generate: (input) => ipcRenderer.invoke(IPC_CHANNELS.WORKFLOW_GENERATE, input),
    list: () => ipcRenderer.invoke(IPC_CHANNELS.WORKFLOW_LIST),
    get: (id) => ipcRenderer.invoke(IPC_CHANNELS.WORKFLOW_GET, id),
    create: (data) => ipcRenderer.invoke(IPC_CHANNELS.WORKFLOW_CREATE, data),
    update: (id, data) => ipcRenderer.invoke(IPC_CHANNELS.WORKFLOW_UPDATE, id, data),
    delete: (id) => ipcRenderer.invoke(IPC_CHANNELS.WORKFLOW_DELETE, id),
  },

  pipeline: {
    getRunForDirective: (directiveId) => ipcRenderer.invoke(IPC_CHANNELS.PIPELINE_GET_RUN, directiveId),
    resumeHumanStage: (pipelineRunId, input) => ipcRenderer.invoke(IPC_CHANNELS.PIPELINE_RESUME_HUMAN, pipelineRunId, input),
    onStageComplete: (callback) => {
      ipcRenderer.on(IPC_CHANNELS.PIPELINE_STAGE_COMPLETE, (_, data) => callback(data));
    },
  },

  analytics: {
    getRunMetrics: (runId) => ipcRenderer.invoke(IPC_CHANNELS.ANALYTICS_RUN, runId),
    getConscriptMetrics: (conscriptId) => ipcRenderer.invoke(IPC_CHANNELS.ANALYTICS_CONSCRIPT, conscriptId),
    getSessionMetrics: (options) => ipcRenderer.invoke(IPC_CHANNELS.ANALYTICS_SESSION, options),
    getTrend: (metric, options) => ipcRenderer.invoke(IPC_CHANNELS.ANALYTICS_TREND, metric, options),
    export: (options) => ipcRenderer.invoke(IPC_CHANNELS.ANALYTICS_EXPORT, options),
  },
};

contextBridge.exposeInMainWorld('sweatshop', api);
