import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../shared/ipc-channels';
import * as dbService from './services/database';
import { generateStoryDetails } from './services/story-generator';
import * as deathmark from './services/deathmark';
import { getSettings, updateSettings } from './services/settings';
import { agentManager } from './services/agent-manager';
import { orchestrator } from './services/orchestrator';
import { browserManager } from './services/browser-manager';

export function registerIpcHandlers(): void {
  // Tickets
  ipcMain.handle(IPC_CHANNELS.TICKET_LIST, (_, filter) => {
    return dbService.listTickets(filter);
  });

  ipcMain.handle(IPC_CHANNELS.TICKET_GET, (_, id: string) => {
    return dbService.getTicket(id);
  });

  ipcMain.handle(IPC_CHANNELS.TICKET_CREATE, (_, data) => {
    return dbService.createTicket(data);
  });

  ipcMain.handle(IPC_CHANNELS.TICKET_UPDATE, (_, id: string, data) => {
    return dbService.updateTicket(id, data);
  });

  ipcMain.handle(IPC_CHANNELS.TICKET_DELETE, (_, id: string) => {
    return dbService.deleteTicket(id);
  });

  // Agents
  ipcMain.handle(IPC_CHANNELS.AGENT_LIST, () => {
    return dbService.listAgents();
  });

  ipcMain.handle(IPC_CHANNELS.AGENT_GET, (_, id: string) => {
    return dbService.getAgent(id);
  });

  ipcMain.handle(IPC_CHANNELS.AGENT_CREATE, async (_, data) => {
    return agentManager.createAgent(data.name || data);
  });

  ipcMain.handle(IPC_CHANNELS.AGENT_UPDATE, (_, id: string, data) => {
    return dbService.updateAgent(id, data);
  });

  ipcMain.handle(IPC_CHANNELS.AGENT_ASSIGN, async (_, agentId: string, ticketId: string, config) => {
    return agentManager.assignTicket(agentId, ticketId, config);
  });

  ipcMain.handle(IPC_CHANNELS.AGENT_APPROVE, async (_, agentId: string) => {
    return agentManager.approveWork(agentId);
  });

  ipcMain.handle(IPC_CHANNELS.AGENT_REJECT, async (_, agentId: string, feedback: string) => {
    return agentManager.rejectWork(agentId, feedback);
  });

  ipcMain.handle(IPC_CHANNELS.AGENT_STOP, async (_, agentId: string) => {
    return agentManager.stopAgent(agentId);
  });

  // Scratch Orgs
  ipcMain.handle(IPC_CHANNELS.ORG_LIST, () => {
    return dbService.listOrgs();
  });

  ipcMain.handle(IPC_CHANNELS.ORG_CLAIM, (_, agentId: string) => {
    return dbService.claimOrg(agentId);
  });

  ipcMain.handle(IPC_CHANNELS.ORG_RELEASE, (_, orgId: string) => {
    return dbService.releaseOrg(orgId);
  });

  // Chat
  ipcMain.handle(IPC_CHANNELS.CHAT_HISTORY, (_, agentId: string) => {
    return dbService.chatHistory(agentId);
  });

  ipcMain.handle(IPC_CHANNELS.CHAT_SEND, async (_, agentId: string, content: string) => {
    await agentManager.sendMessage(agentId, content);
    return dbService.chatHistory(agentId).slice(-1)[0];
  });

  // Runs
  ipcMain.handle(IPC_CHANNELS.RUN_LIST, (_, ticketId?: string) => {
    return dbService.listRuns(ticketId);
  });

  ipcMain.handle(IPC_CHANNELS.RUN_GET, (_, id: string) => {
    return dbService.getRun(id);
  });

  ipcMain.handle(IPC_CHANNELS.RUN_CURRENT, (_, agentId: string) => {
    return dbService.currentRun(agentId);
  });

  // Story generation
  ipcMain.handle(IPC_CHANNELS.STORY_GENERATE, async (_, input) => {
    return generateStoryDetails(input);
  });

  // Deathmark
  ipcMain.handle(IPC_CHANNELS.DEATHMARK_TEST_CONNECTION, async () => {
    return deathmark.testConnection();
  });

  ipcMain.handle(IPC_CHANNELS.DEATHMARK_SYNC, async () => {
    const partialTickets = await deathmark.fetchTickets();
    const created: ReturnType<typeof dbService.createTicket>[] = [];
    for (const t of partialTickets) {
      // Skip if already imported (check by externalId)
      const existing = dbService.listTickets().find(
        (e) => e.externalId === t.externalId
      );
      if (existing) {
        created.push(dbService.updateTicket(existing.id, t));
      } else {
        created.push(dbService.createTicket({
          source: 'deathmark',
          title: t.title || 'Untitled',
          description: t.description || '',
          acceptanceCriteria: t.acceptanceCriteria || '',
          labels: t.labels || [],
          priority: t.priority || 'medium',
          status: t.status || 'backlog',
          dependsOn: t.dependsOn || [],
          externalId: t.externalId,
        }));
      }
    }
    return created;
  });

  // Orchestrator
  ipcMain.handle(IPC_CHANNELS.ORCHESTRATOR_LOAD, async (_, ticketIds: string[]) => {
    return orchestrator.loadTickets(ticketIds);
  });

  ipcMain.handle(IPC_CHANNELS.ORCHESTRATOR_START, async () => {
    return orchestrator.start();
  });

  ipcMain.handle(IPC_CHANNELS.ORCHESTRATOR_STOP, async () => {
    return orchestrator.stop();
  });

  ipcMain.handle(IPC_CHANNELS.ORCHESTRATOR_STATUS, () => {
    return orchestrator.getStatus();
  });

  // Browser
  ipcMain.handle(IPC_CHANNELS.BROWSER_LOAD_URL, (_, agentId: string, url: string) => {
    browserManager.create(agentId);
    browserManager.loadURL(agentId, url);
  });

  ipcMain.handle(IPC_CHANNELS.BROWSER_SET_BOUNDS, (_, agentId: string, bounds) => {
    browserManager.setBounds(agentId, bounds);
  });

  ipcMain.handle(IPC_CHANNELS.BROWSER_BACK, (_, agentId: string) => {
    browserManager.goBack(agentId);
  });

  ipcMain.handle(IPC_CHANNELS.BROWSER_FORWARD, (_, agentId: string) => {
    browserManager.goForward(agentId);
  });

  ipcMain.handle(IPC_CHANNELS.BROWSER_RELOAD, (_, agentId: string) => {
    browserManager.reload(agentId);
  });

  ipcMain.handle(IPC_CHANNELS.BROWSER_GET_URL, (_, agentId: string) => {
    return browserManager.getURL(agentId);
  });

  ipcMain.handle(IPC_CHANNELS.BROWSER_SHOW, (_, agentId: string, bounds) => {
    browserManager.show(agentId, bounds);
  });

  ipcMain.handle(IPC_CHANNELS.BROWSER_HIDE_ALL, () => {
    browserManager.hideAll();
  });

  // Settings
  ipcMain.handle(IPC_CHANNELS.SETTINGS_GET, () => {
    return getSettings();
  });

  ipcMain.handle(IPC_CHANNELS.SETTINGS_UPDATE, (_, data) => {
    return updateSettings(data);
  });
}
