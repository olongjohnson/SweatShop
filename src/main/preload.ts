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
  },

  orgs: {
    list: () => ipcRenderer.invoke(IPC_CHANNELS.ORG_LIST),
    claim: (agentId) => ipcRenderer.invoke(IPC_CHANNELS.ORG_CLAIM, agentId),
    release: (orgId) => ipcRenderer.invoke(IPC_CHANNELS.ORG_RELEASE, orgId),
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
