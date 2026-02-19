import { BrowserWindow } from 'electron';
import { AgentInstance } from './agent-instance';
import { GitService } from './git-service';
import * as dbService from './database';
import { getSettings } from './settings';
import { IPC_CHANNELS } from '../../shared/ipc-channels';
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

    // Determine working directory — either from config or settings
    const projectDir = config.workingDirectory || settings.git?.workingDirectory || process.cwd();

    // Set up git worktree for this agent
    let agentWorkDir = projectDir;
    const gitService = new GitService(projectDir);
    const { valid } = await gitService.validate();

    if (valid) {
      try {
        // Create worktree so the agent works in isolation
        agentWorkDir = await gitService.createWorktree(agentId, config.branchName);
        this.worktreePaths.set(agentId, agentWorkDir);
      } catch (err) {
        console.warn(`[AgentManager] Worktree creation failed, using project dir:`, err);
        // Fall back to project dir
      }
    }

    // Update agent assignment in DB
    dbService.updateAgent(agentId, {
      assignedTicketId: ticketId,
      assignedOrgAlias: config.orgAlias,
      branchName: config.branchName,
      status: 'ASSIGNED',
    });

    // Update ticket status
    dbService.updateTicket(ticketId, { status: 'in_progress', assignedAgentId: agentId });

    // Create agent instance
    const instance = new AgentInstance(agentId, agentRecord.name, apiKey);
    this.agents.set(agentId, instance);

    // Wire up events to broadcast to renderer
    this.wireEvents(instance);

    // Start the agentic loop (async — runs in background)
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
      // Agent not running — just save the chat message
      dbService.chatSend(agentId, message, 'user');
      return;
    }
    await instance.handleHumanMessage(message);
  }

  async approveWork(agentId: string): Promise<void> {
    const agent = dbService.getAgent(agentId);
    if (!agent) throw new Error(`Agent ${agentId} not found`);

    dbService.updateAgent(agentId, { status: 'MERGING' });
    this.broadcastStatus(agentId, 'MERGING');

    const settings = getSettings();
    const projectDir = settings.git?.workingDirectory || process.cwd();
    const mergeStrategy = settings.git?.mergeStrategy || 'squash';

    if (agent.branchName) {
      const gitService = new GitService(projectDir);
      const { valid } = await gitService.validate();

      if (valid) {
        const result = await gitService.merge(agent.branchName, mergeStrategy);

        if (!result.success) {
          // Merge conflict — abort and report
          await gitService.abortMerge();
          dbService.updateAgent(agentId, { status: 'ERROR' });
          this.broadcastStatus(agentId, 'ERROR');
          dbService.chatSend(
            agentId,
            `Merge conflict detected in: ${result.conflictFiles?.join(', ') || 'unknown files'}`,
            'system'
          );
          return;
        }

        // Clean up: remove worktree and delete branch
        try {
          await gitService.removeWorktree(agentId);
          this.worktreePaths.delete(agentId);
        } catch { /* OK */ }

        try {
          await gitService.deleteBranch(agent.branchName);
        } catch { /* branch may already be deleted */ }
      }
    }

    // Mark agent IDLE and ticket merged
    dbService.updateAgent(agentId, {
      status: 'IDLE',
      assignedTicketId: undefined,
      branchName: undefined,
    });
    this.broadcastStatus(agentId, 'IDLE');

    if (agent.assignedTicketId) {
      dbService.updateTicket(agent.assignedTicketId, { status: 'merged' });
    }

    // Clean up instance
    const instance = this.agents.get(agentId);
    if (instance) {
      instance.stop();
      this.agents.delete(agentId);
    }
  }

  async rejectWork(agentId: string, feedback: string): Promise<void> {
    const agent = dbService.getAgent(agentId);
    if (!agent) throw new Error(`Agent ${agentId} not found`);

    dbService.updateAgent(agentId, { status: 'REWORK' });

    if (agent.assignedTicketId) {
      dbService.updateTicket(agent.assignedTicketId, { status: 'in_progress' });
    }

    const instance = this.agents.get(agentId);
    if (instance) {
      await instance.handleHumanMessage(`REWORK REQUESTED: ${feedback}`);
    }

    this.broadcastStatus(agentId, 'REWORK');
  }

  async stopAgent(agentId: string): Promise<void> {
    const instance = this.agents.get(agentId);
    if (instance) {
      instance.stop();
      this.agents.delete(agentId);
    }

    // Clean up worktree
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
