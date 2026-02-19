import { BrowserWindow } from 'electron';
import { AgentInstance } from './agent-instance';
import { GitService } from './git-service';
import * as dbService from './database';
import { getSettings } from './settings';
import { IPC_CHANNELS } from '../../shared/ipc-channels';
import { assertTransition, isInterruptState } from './agent-state-machine';
import type { Agent, AgentStatus } from '../../shared/types';

class AgentManager {
  private agents = new Map<string, AgentInstance>();
  private worktreePaths = new Map<string, string>();

  async createAgent(name: string): Promise<Agent> {
    const agent = dbService.createAgent({
      name,
      status: 'IDLE',
    });
    return agent;
  }

  private transitionAgent(agentId: string, newStatus: AgentStatus): void {
    const agent = dbService.getAgent(agentId);
    if (!agent) throw new Error(`Agent ${agentId} not found`);
    assertTransition(agent.status, newStatus);
    dbService.updateAgent(agentId, { status: newStatus });
    this.broadcastStatus(agentId, newStatus);

    // Fire notification event for interrupt states
    if (isInterruptState(newStatus)) {
      this.broadcast(IPC_CHANNELS.AGENT_NOTIFICATION, {
        agentId,
        agentName: agent.name,
        status: newStatus,
      });
    }
  }

  async assignTicket(
    agentId: string,
    ticketId: string,
    config: {
      orgAlias: string;
      branchName: string;
      refinedPrompt: string;
      workingDirectory: string;
    }
  ): Promise<void> {
    const settings = getSettings();
    const apiKey = settings.anthropicApiKey || process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error('Anthropic API key not configured. Set it in Settings.');
    }

    const agentRecord = dbService.getAgent(agentId);
    if (!agentRecord) throw new Error(`Agent ${agentId} not found`);

    // IDLE → ASSIGNED
    this.transitionAgent(agentId, 'ASSIGNED');
    dbService.updateAgent(agentId, {
      assignedTicketId: ticketId,
      assignedOrgAlias: config.orgAlias,
      branchName: config.branchName,
    });
    dbService.updateTicket(ticketId, { status: 'in_progress', assignedAgentId: agentId });

    // ASSIGNED → BRANCHING
    this.transitionAgent(agentId, 'BRANCHING');
    dbService.chatSend(agentId, `Creating branch ${config.branchName}...`, 'system');

    const projectDir = config.workingDirectory || settings.git?.workingDirectory || process.cwd();
    let agentWorkDir = projectDir;
    const gitService = new GitService(projectDir);
    const { valid } = await gitService.validate();

    if (valid) {
      try {
        agentWorkDir = await gitService.createWorktree(agentId, config.branchName);
        this.worktreePaths.set(agentId, agentWorkDir);
      } catch (err) {
        console.warn(`[AgentManager] Worktree creation failed, using project dir:`, err);
      }
    }

    // BRANCHING → DEVELOPING
    this.transitionAgent(agentId, 'DEVELOPING');

    const instance = new AgentInstance(agentId, agentRecord.name, apiKey);
    this.agents.set(agentId, instance);
    this.wireEvents(instance);

    instance.start({
      ticketId,
      orgAlias: config.orgAlias,
      branchName: config.branchName,
      prompt: config.refinedPrompt,
      workingDirectory: agentWorkDir,
    });
  }

  async sendMessage(agentId: string, message: string): Promise<void> {
    const instance = this.agents.get(agentId);
    if (!instance) {
      dbService.chatSend(agentId, message, 'user');
      return;
    }
    await instance.handleHumanMessage(message);
  }

  async approveWork(agentId: string): Promise<void> {
    const agent = dbService.getAgent(agentId);
    if (!agent) throw new Error(`Agent ${agentId} not found`);

    // QA_READY → MERGING
    this.transitionAgent(agentId, 'MERGING');
    dbService.chatSend(agentId, 'Merging to base branch...', 'system');

    const settings = getSettings();
    const projectDir = settings.git?.workingDirectory || process.cwd();
    const mergeStrategy = settings.git?.mergeStrategy || 'squash';

    if (agent.branchName) {
      const gitService = new GitService(projectDir);
      const { valid } = await gitService.validate();

      if (valid) {
        const result = await gitService.merge(agent.branchName, mergeStrategy);

        if (!result.success) {
          await gitService.abortMerge();
          // MERGING → ERROR
          dbService.updateAgent(agentId, { status: 'ERROR' });
          this.broadcastStatus(agentId, 'ERROR');
          this.broadcast(IPC_CHANNELS.AGENT_NOTIFICATION, {
            agentId, agentName: agent.name, status: 'ERROR' as AgentStatus,
          });
          dbService.chatSend(
            agentId,
            `Merge conflict detected in: ${result.conflictFiles?.join(', ') || 'unknown files'}`,
            'system'
          );
          return;
        }

        try {
          await gitService.removeWorktree(agentId);
          this.worktreePaths.delete(agentId);
        } catch { /* OK */ }

        try {
          await gitService.deleteBranch(agent.branchName);
        } catch { /* branch may already be deleted */ }
      }
    }

    // MERGING → IDLE
    dbService.updateAgent(agentId, {
      status: 'IDLE',
      assignedTicketId: undefined,
      branchName: undefined,
    });
    this.broadcastStatus(agentId, 'IDLE');

    const ticketTitle = agent.assignedTicketId
      ? dbService.getTicket(agent.assignedTicketId)?.title || agent.assignedTicketId
      : '';

    if (agent.assignedTicketId) {
      dbService.updateTicket(agent.assignedTicketId, { status: 'merged' });
    }

    dbService.chatSend(agentId, 'Work complete! Branch merged.', 'system');

    // Notify ticket merged
    this.broadcast(IPC_CHANNELS.AGENT_NOTIFICATION, {
      agentId,
      agentName: agent.name,
      status: 'IDLE' as AgentStatus,
      event: 'merged',
      ticketTitle,
    });

    const instance = this.agents.get(agentId);
    if (instance) {
      instance.stop();
      this.agents.delete(agentId);
    }
  }

  async rejectWork(agentId: string, feedback: string): Promise<void> {
    const agent = dbService.getAgent(agentId);
    if (!agent) throw new Error(`Agent ${agentId} not found`);

    // QA_READY → REWORK
    this.transitionAgent(agentId, 'REWORK');
    dbService.chatSend(agentId, `Rework requested: ${feedback}`, 'system');

    if (agent.assignedTicketId) {
      dbService.updateTicket(agent.assignedTicketId, { status: 'in_progress' });
    }

    const instance = this.agents.get(agentId);
    if (instance) {
      await instance.handleHumanMessage(`REWORK REQUESTED: ${feedback}`);
    }
  }

  async stopAgent(agentId: string): Promise<void> {
    const instance = this.agents.get(agentId);
    if (instance) {
      instance.stop();
      this.agents.delete(agentId);
    }

    const agent = dbService.getAgent(agentId);
    if (agent) {
      const settings = getSettings();
      const projectDir = settings.git?.workingDirectory || process.cwd();
      const gitService = new GitService(projectDir);

      try {
        await gitService.removeWorktree(agentId);
        this.worktreePaths.delete(agentId);
      } catch { /* OK */ }
    }

    dbService.updateAgent(agentId, { status: 'IDLE', assignedTicketId: undefined, branchName: undefined });
    this.broadcastStatus(agentId, 'IDLE');
  }

  getAgentInstance(agentId: string): AgentInstance | undefined {
    return this.agents.get(agentId);
  }

  getWorktreePath(agentId: string): string | undefined {
    return this.worktreePaths.get(agentId);
  }

  listActiveAgents(): AgentInstance[] {
    return Array.from(this.agents.values());
  }

  private wireEvents(instance: AgentInstance): void {
    instance.on('status-changed', (status: AgentStatus) => {
      this.broadcastStatus(instance.id, status);

      if (isInterruptState(status)) {
        const agent = dbService.getAgent(instance.id);
        this.broadcast(IPC_CHANNELS.AGENT_NOTIFICATION, {
          agentId: instance.id,
          agentName: agent?.name || instance.name,
          status,
        });
      }
    });

    instance.on('chat-message', (msg: unknown) => {
      this.broadcast(IPC_CHANNELS.CHAT_ON_MESSAGE, msg);
    });

    instance.on('terminal-data', (data: string) => {
      this.broadcast(IPC_CHANNELS.AGENT_TERMINAL_DATA, {
        agentId: instance.id,
        data,
      });
    });
  }

  private broadcastStatus(agentId: string, status: AgentStatus): void {
    this.broadcast(IPC_CHANNELS.AGENT_STATUS_CHANGED, { agentId, status });
  }

  private broadcast(channel: string, data: unknown): void {
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send(channel, data);
    }
  }
}

// Singleton
export const agentManager = new AgentManager();
