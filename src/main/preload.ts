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
    assign: (agentId, ticketId, config) =>
      ipcRenderer.invoke(IPC_CHANNELS.AGENT_ASSIGN, agentId, ticketId, config),
    approve: (agentId) => ipcRenderer.invoke(IPC_CHANNELS.AGENT_APPROVE, agentId),
    reject: (agentId, feedback) =>
      ipcRenderer.invoke(IPC_CHANNELS.AGENT_REJECT, agentId, feedback),
    stop: (agentId) => ipcRenderer.invoke(IPC_CHANNELS.AGENT_STOP, agentId),
    onStatusChanged: (callback) => {
      ipcRenderer.on(IPC_CHANNELS.AGENT_STATUS_CHANGED, (_, data) => callback(data));
    },
    onTerminalData: (callback) => {
      ipcRenderer.on(IPC_CHANNELS.AGENT_TERMINAL_DATA, (_, data) => callback(data));
    },
  },

  orgs: {
    list: () => ipcRenderer.invoke(IPC_CHANNELS.ORG_LIST),
    claim: (agentId) => ipcRenderer.invoke(IPC_CHANNELS.ORG_CLAIM, agentId),
    release: (orgId) => ipcRenderer.invoke(IPC_CHANNELS.ORG_RELEASE, orgId),
    getStatus: () => ipcRenderer.invoke(IPC_CHANNELS.ORG_STATUS),
    discover: () => ipcRenderer.invoke(IPC_CHANNELS.ORG_DISCOVER),
    register: (alias) => ipcRenderer.invoke(IPC_CHANNELS.ORG_REGISTER, alias),
    remove: (orgId) => ipcRenderer.invoke(IPC_CHANNELS.ORG_REMOVE, orgId),
  },

  chat: {
    history: (agentId) => ipcRenderer.invoke(IPC_CHANNELS.CHAT_HISTORY, agentId),
    send: (agentId, content) => ipcRenderer.invoke(IPC_CHANNELS.CHAT_SEND, agentId, content),
    onMessage: (callback) => {
      ipcRenderer.on(IPC_CHANNELS.CHAT_ON_MESSAGE, (_, msg) => callback(msg));
    },
  },

  runs: {
    list: (ticketId?) => ipcRenderer.invoke(IPC_CHANNELS.RUN_LIST, ticketId),
    get: (id) => ipcRenderer.invoke(IPC_CHANNELS.RUN_GET, id),
    current: (agentId) => ipcRenderer.invoke(IPC_CHANNELS.RUN_CURRENT, agentId),
  },

  stories: {
    generate: (input) => ipcRenderer.invoke(IPC_CHANNELS.STORY_GENERATE, input),
  },

  orchestrator: {
    loadTickets: (ticketIds) => ipcRenderer.invoke(IPC_CHANNELS.ORCHESTRATOR_LOAD, ticketIds),
    start: () => ipcRenderer.invoke(IPC_CHANNELS.ORCHESTRATOR_START),
    stop: () => ipcRenderer.invoke(IPC_CHANNELS.ORCHESTRATOR_STOP),
    getStatus: () => ipcRenderer.invoke(IPC_CHANNELS.ORCHESTRATOR_STATUS),
    onProgress: (callback) => {
      ipcRenderer.on(IPC_CHANNELS.ORCHESTRATOR_PROGRESS, (_, data) => callback(data));
    },
  },

  git: {
    validate: (dir) => ipcRenderer.invoke(IPC_CHANNELS.GIT_VALIDATE, dir),
    getModifiedFiles: (agentId) => ipcRenderer.invoke(IPC_CHANNELS.GIT_MODIFIED_FILES, agentId),
    getDiffSummary: (agentId) => ipcRenderer.invoke(IPC_CHANNELS.GIT_DIFF_SUMMARY, agentId),
  },

  browser: {
    loadURL: (agentId, url) => ipcRenderer.invoke(IPC_CHANNELS.BROWSER_LOAD_URL, agentId, url),
    setBounds: (agentId, bounds) => ipcRenderer.invoke(IPC_CHANNELS.BROWSER_SET_BOUNDS, agentId, bounds),
    back: (agentId) => ipcRenderer.invoke(IPC_CHANNELS.BROWSER_BACK, agentId),
    forward: (agentId) => ipcRenderer.invoke(IPC_CHANNELS.BROWSER_FORWARD, agentId),
    reload: (agentId) => ipcRenderer.invoke(IPC_CHANNELS.BROWSER_RELOAD, agentId),
    getURL: (agentId) => ipcRenderer.invoke(IPC_CHANNELS.BROWSER_GET_URL, agentId),
    show: (agentId, bounds) => ipcRenderer.invoke(IPC_CHANNELS.BROWSER_SHOW, agentId, bounds),
    hideAll: () => ipcRenderer.invoke(IPC_CHANNELS.BROWSER_HIDE_ALL),
  },

  deathmark: {
    testConnection: () => ipcRenderer.invoke(IPC_CHANNELS.DEATHMARK_TEST_CONNECTION),
    sync: () => ipcRenderer.invoke(IPC_CHANNELS.DEATHMARK_SYNC),
  },

  settings: {
    get: () => ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_GET),
    update: (data) => ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_UPDATE, data),
  },
};

contextBridge.exposeInMainWorld('sweatshop', api);
