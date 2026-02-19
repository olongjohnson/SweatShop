import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../shared/ipc-channels';
import * as dbService from './services/database';

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

  ipcMain.handle(IPC_CHANNELS.AGENT_CREATE, (_, data) => {
    return dbService.createAgent(data);
  });

  ipcMain.handle(IPC_CHANNELS.AGENT_UPDATE, (_, id: string, data) => {
    return dbService.updateAgent(id, data);
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

  ipcMain.handle(IPC_CHANNELS.CHAT_SEND, (_, agentId: string, content: string) => {
    return dbService.chatSend(agentId, content);
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
}
