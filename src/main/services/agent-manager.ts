import { BrowserWindow } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { ConscriptInstance } from './agent-instance';
import { GitService } from './git-service';
import * as dbService from './database';
import { getSettings } from './settings';
import { IPC_CHANNELS } from '../../shared/ipc-channels';
import { assertTransition, isInterruptState, isActiveState } from './agent-state-machine';
import { lwcPreview } from './lwc-preview';
import * as writeback from './deathmark-writeback';
import type { Conscript, ConscriptStatus } from '../../shared/types';

const LOG_FILE = path.join(process.env.USERPROFILE || process.env.HOME || '.', 'sweatshop-conscript.log');
function debugLog(msg: string): void {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  fs.appendFileSync(LOG_FILE, line);
}

class ConscriptManager {
  private conscripts = new Map<string, ConscriptInstance>();
  private worktreePaths = new Map<string, string>();

  /** Write a chat message to DB AND broadcast it to the renderer */
  private chatSend(conscriptId: string, content: string, role: 'system' | 'user' | 'conscript' = 'system'): void {
    const msg = dbService.chatSend(conscriptId, content, role);
    this.broadcast(IPC_CHANNELS.CHAT_ON_MESSAGE, msg);
  }

  /**
   * On app startup, reset conscripts stuck in active states back to ERROR.
   * Their backing agent processes are gone after restart.
   */
  recoverStuckConscripts(): void {
    const conscripts = dbService.listConscripts();
    const stuckStates: ConscriptStatus[] = ['ASSIGNED', 'BRANCHING', 'DEVELOPING', 'PROVISIONING', 'REWORK', 'MERGING'];
    for (const c of conscripts) {
      if (stuckStates.includes(c.status)) {
        debugLog(`[ConscriptManager] Recovering stuck conscript ${c.id} (${c.name}) from ${c.status} → ERROR`);
        dbService.updateConscript(c.id, { status: 'ERROR' });
        this.chatSend(c.id, `App restarted while conscript was in ${c.status} state. Agent process lost — reset to ERROR. You can stop/scrap or re-assign.`);
      }
    }
  }

  async createConscript(name: string): Promise<Conscript> {
    const conscript = dbService.createConscript({
      name,
      status: 'IDLE',
      assignedCampAliases: [],
    });
    return conscript;
  }

  private transitionConscript(conscriptId: string, newStatus: ConscriptStatus): void {
    const conscript = dbService.getConscript(conscriptId);
    if (!conscript) throw new Error(`Conscript ${conscriptId} not found`);
    assertTransition(conscript.status, newStatus);
    dbService.updateConscript(conscriptId, { status: newStatus });
    this.broadcastStatus(conscriptId, newStatus);

    // Fire notification event for interrupt states
    if (isInterruptState(newStatus)) {
      this.broadcast(IPC_CHANNELS.CONSCRIPT_NOTIFICATION, {
        conscriptId,
        conscriptName: conscript.name,
        status: newStatus,
      });
    }
  }

  async assignDirective(
    conscriptId: string,
    directiveId: string,
    config: {
      campAlias: string;
      branchName: string;
      refinedPrompt: string;
      workingDirectory: string;
      identity?: {
        systemPrompt?: string;
        model?: 'sonnet' | 'opus' | 'haiku';
        maxTurns?: number;
        maxBudgetUsd?: number;
        allowedTools?: string[];
        disallowedTools?: string[];
      };
    }
  ): Promise<void> {
    debugLog(`[ConscriptManager] assignDirective called: conscriptId=${conscriptId}, directiveId=${directiveId}`);
    debugLog(`[ConscriptManager] config: branch=${config.branchName}, camp=${config.campAlias}, workDir=${config.workingDirectory}`);
    debugLog(`[ConscriptManager] prompt length: ${config.refinedPrompt?.length || 0}`);

    const settings = getSettings();

    const conscriptRecord = dbService.getConscript(conscriptId);
    if (!conscriptRecord) throw new Error(`Conscript ${conscriptId} not found`);

    const projectDir = config.workingDirectory || settings.git?.workingDirectory;
    if (!projectDir) {
      throw new Error('No project working directory configured. Set it in Settings before assigning work.');
    }

    // IDLE → ASSIGNED
    this.transitionConscript(conscriptId, 'ASSIGNED');
    dbService.updateConscript(conscriptId, {
      assignedDirectiveId: directiveId,
      assignedCampAliases: config.campAlias ? [config.campAlias] : [],
      branchName: config.branchName,
    });
    dbService.updateDirective(directiveId, { status: 'in_progress', assignedConscriptId: conscriptId });
    writeback.onAssigned(directiveId).catch(() => {});

    // ASSIGNED → BRANCHING
    this.transitionConscript(conscriptId, 'BRANCHING');
    this.chatSend(conscriptId, `Creating branch ${config.branchName}...`);
    let conscriptWorkDir = projectDir;
    debugLog(`[ConscriptManager] projectDir=${projectDir}`);
    const gitService = new GitService(projectDir);
    const { valid } = await gitService.validate();
    debugLog(`[ConscriptManager] git valid=${valid}`);

    if (valid) {
      try {
        conscriptWorkDir = await gitService.createWorktree(conscriptId, config.branchName);
        this.worktreePaths.set(conscriptId, conscriptWorkDir);
        this.chatSend(conscriptId, `Branch created. Working in: ${conscriptWorkDir}`);
        debugLog(`[ConscriptManager] Worktree created at: ${conscriptWorkDir}`);
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : String(err);
        debugLog(`[ConscriptManager] Worktree creation failed: ${errMsg}`);
        this.chatSend(conscriptId, `Worktree failed: ${errMsg}. Using project dir instead.`);
      }
    } else {
      this.chatSend(conscriptId, `Not a valid git repo. Working in: ${projectDir}`);
    }

    // BRANCHING → DEVELOPING
    this.transitionConscript(conscriptId, 'DEVELOPING');
    debugLog(`[ConscriptManager] Transitioned to DEVELOPING, creating ConscriptInstance`);

    const instance = new ConscriptInstance(conscriptId, conscriptRecord.name);
    this.conscripts.set(conscriptId, instance);
    this.wireEvents(instance);

    debugLog(`[ConscriptManager] Calling instance.start()`);
    instance.start({
      directiveId,
      campAlias: config.campAlias,
      branchName: config.branchName,
      prompt: config.refinedPrompt,
      workingDirectory: conscriptWorkDir,
      identity: config.identity,
    }).catch((err: unknown) => {
      debugLog(`[ConscriptManager] instance.start() rejected: ${err}`);
    });
  }

  async sendMessage(conscriptId: string, message: string): Promise<void> {
    const instance = this.conscripts.get(conscriptId);
    if (!instance) {
      this.chatSend(conscriptId, message, 'user');
      return;
    }
    await instance.handleHumanMessage(message);
  }

  async retryWork(conscriptId: string): Promise<void> {
    const conscript = dbService.getConscript(conscriptId);
    if (!conscript) throw new Error(`Conscript ${conscriptId} not found`);
    if (conscript.status !== 'ERROR') throw new Error(`Cannot retry: conscript is ${conscript.status}, not ERROR`);
    if (!conscript.assignedDirectiveId) throw new Error('Cannot retry: no directive assigned');

    const directive = dbService.getDirective(conscript.assignedDirectiveId);
    if (!directive) throw new Error('Cannot retry: directive not found');

    // Kill stale instance if still in map
    const oldInstance = this.conscripts.get(conscriptId);
    if (oldInstance) {
      oldInstance.stop();
      this.conscripts.delete(conscriptId);
    }

    // Build prompt from directive + previous attempt context
    const promptParts = [
      `# ${directive.title}`,
      '',
      directive.description,
      '',
      directive.acceptanceCriteria ? `## Acceptance Criteria\n${directive.acceptanceCriteria}` : '',
    ].filter(Boolean);

    const chatHistory = dbService.chatHistory(conscriptId);
    if (chatHistory.length > 0) {
      const contextMessages = chatHistory
        .filter((m) => m.role !== 'system' || m.content.includes('error') || m.content.includes('Error') || m.content.includes('Rework'))
        .slice(-30)
        .map((m) => `[${m.role}]: ${m.content}`)
        .join('\n');
      promptParts.push(
        '',
        '## Previous Attempt Context',
        'This directive was attempted before but failed. Use this context to avoid the same issues:',
        '',
        contextMessages,
      );
    }

    const settings = getSettings();
    const projectDir = settings.git?.workingDirectory || '';
    const branchName = conscript.branchName || `conscript/${directive.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40)}`;

    // Resolve working directory — reuse existing worktree or project dir
    let conscriptWorkDir = this.worktreePaths.get(conscriptId) || projectDir;

    // If no worktree exists, try to create/reuse one
    if (!this.worktreePaths.has(conscriptId) && projectDir) {
      const gitService = new GitService(projectDir);
      const { valid } = await gitService.validate();
      if (valid) {
        try {
          conscriptWorkDir = await gitService.createWorktree(conscriptId, branchName);
          this.worktreePaths.set(conscriptId, conscriptWorkDir);
        } catch {
          // Worktree may already exist from previous attempt — try to use it
          const existingPath = `${projectDir}/.worktrees/${conscriptId}`;
          const fs = await import('fs');
          if (fs.existsSync(existingPath)) {
            conscriptWorkDir = existingPath;
            this.worktreePaths.set(conscriptId, conscriptWorkDir);
          }
        }
      }
    }

    // ERROR → DEVELOPING
    this.transitionConscript(conscriptId, 'DEVELOPING');
    this.chatSend(conscriptId, 'Retrying with context from previous attempt...');

    const instance = new ConscriptInstance(conscriptId, conscript.name);
    this.conscripts.set(conscriptId, instance);
    this.wireEvents(instance);

    const campAliases = conscript.assignedCampAliases || [];
    instance.start({
      directiveId: conscript.assignedDirectiveId,
      campAlias: campAliases[0] || '',
      branchName,
      prompt: promptParts.join('\n'),
      workingDirectory: conscriptWorkDir,
    }).catch((err: unknown) => {
      debugLog(`[ConscriptManager] retryWork instance.start() rejected: ${err}`);
    });
  }

  async approveWork(conscriptId: string): Promise<void> {
    lwcPreview.stop(conscriptId);
    const conscript = dbService.getConscript(conscriptId);
    if (!conscript) throw new Error(`Conscript ${conscriptId} not found`);

    // QA_READY → MERGING
    this.transitionConscript(conscriptId, 'MERGING');
    this.chatSend(conscriptId, 'Merging to base branch...');

    const settings = getSettings();
    const projectDir = settings.git?.workingDirectory || '';
    const mergeStrategy = settings.git?.mergeStrategy || 'squash';

    if (conscript.branchName) {
      const gitService = new GitService(projectDir);
      const { valid } = await gitService.validate();

      if (valid) {
        const result = await gitService.merge(conscript.branchName, mergeStrategy);

        if (!result.success) {
          await gitService.abortMerge();
          // MERGING → ERROR
          dbService.updateConscript(conscriptId, { status: 'ERROR' });
          this.broadcastStatus(conscriptId, 'ERROR');
          this.broadcast(IPC_CHANNELS.CONSCRIPT_NOTIFICATION, {
            conscriptId, conscriptName: conscript.name, status: 'ERROR' as ConscriptStatus,
          });
          this.chatSend(conscriptId, `Merge conflict detected in: ${result.conflictFiles?.join(', ') || 'unknown files'}`);
          return;
        }

        try {
          await gitService.removeWorktree(conscriptId);
          this.worktreePaths.delete(conscriptId);
        } catch { /* OK */ }

        try {
          await gitService.deleteBranch(conscript.branchName);
        } catch { /* branch may already be deleted */ }
      }
    }

    // MERGING → IDLE
    dbService.updateConscript(conscriptId, {
      status: 'IDLE',
      assignedDirectiveId: undefined,
      branchName: undefined,
    });
    this.broadcastStatus(conscriptId, 'IDLE');

    const directiveTitle = conscript.assignedDirectiveId
      ? dbService.getDirective(conscript.assignedDirectiveId)?.title || conscript.assignedDirectiveId
      : '';

    if (conscript.assignedDirectiveId) {
      dbService.updateDirective(conscript.assignedDirectiveId, { status: 'merged' });
      const runs = dbService.listRuns(conscript.assignedDirectiveId);
      const lastRun = runs[runs.length - 1];
      if (lastRun) writeback.onWorkApproved(conscript.assignedDirectiveId, lastRun.id).catch(() => {});
    }

    this.chatSend(conscriptId, 'Work complete! Branch merged.');

    // Notify directive merged
    this.broadcast(IPC_CHANNELS.CONSCRIPT_NOTIFICATION, {
      conscriptId,
      conscriptName: conscript.name,
      status: 'IDLE' as ConscriptStatus,
      event: 'merged',
      directiveTitle,
    });

    const instance = this.conscripts.get(conscriptId);
    if (instance) {
      instance.stop();
      this.conscripts.delete(conscriptId);
    }
  }

  async rejectWork(conscriptId: string, feedback: string): Promise<void> {
    lwcPreview.stop(conscriptId);
    const conscript = dbService.getConscript(conscriptId);
    if (!conscript) throw new Error(`Conscript ${conscriptId} not found`);

    // QA_READY → REWORK
    this.transitionConscript(conscriptId, 'REWORK');
    this.chatSend(conscriptId, `Rework requested: ${feedback}`);

    if (conscript.assignedDirectiveId) {
      dbService.updateDirective(conscript.assignedDirectiveId, { status: 'in_progress' });
      const run = dbService.currentRun(conscriptId);
      if (run) writeback.onReworkRequested(conscript.assignedDirectiveId, run.id).catch(() => {});
    }

    const instance = this.conscripts.get(conscriptId);
    if (instance) {
      await instance.handleHumanMessage(`REWORK REQUESTED: ${feedback}`);
    }
  }

  async stopConscript(conscriptId: string): Promise<void> {
    lwcPreview.stop(conscriptId);
    const instance = this.conscripts.get(conscriptId);
    if (instance) {
      instance.stop();
      this.conscripts.delete(conscriptId);
    }

    const conscript = dbService.getConscript(conscriptId);
    if (conscript) {
      const settings = getSettings();
      const projectDir = settings.git?.workingDirectory || '';

      if (projectDir) {
        const gitService = new GitService(projectDir);

        try {
          await gitService.removeWorktree(conscriptId);
          this.worktreePaths.delete(conscriptId);
        } catch { /* OK */ }

        // Delete the feature branch
        if (conscript.branchName) {
          try {
            await gitService.deleteBranch(conscript.branchName);
          } catch { /* branch may already be gone */ }
        }
      }

      // Reset directive back to ready so it can be reassigned
      if (conscript.assignedDirectiveId) {
        const runs = dbService.listRuns(conscript.assignedDirectiveId);
        const lastRun = runs[runs.length - 1];
        if (lastRun) writeback.onWorkReturned(conscript.assignedDirectiveId, lastRun.id, 'Returned to human by user. Conscript stopped before completion.').catch(() => {});
        dbService.updateDirective(conscript.assignedDirectiveId, { status: 'ready', assignedConscriptId: undefined });
      }
    }

    dbService.updateConscript(conscriptId, { status: 'IDLE', assignedDirectiveId: undefined, branchName: undefined });
    this.broadcastStatus(conscriptId, 'IDLE');
    this.chatSend(conscriptId, 'Conscript stopped. Ready for new work.');
  }

  async scrapWork(conscriptId: string): Promise<void> {
    lwcPreview.stop(conscriptId);
    const conscript = dbService.getConscript(conscriptId);
    if (!conscript) throw new Error(`Conscript ${conscriptId} not found`);

    // Stop the running instance if any
    const instance = this.conscripts.get(conscriptId);
    if (instance) {
      instance.stop();
      this.conscripts.delete(conscriptId);
    }

    const settings = getSettings();
    const projectDir = settings.git?.workingDirectory || '';
    const branchName = conscript.branchName;

    if (projectDir) {
      const gitService = new GitService(projectDir);

      // Remove worktree first (must happen before branch delete)
      try {
        await gitService.removeWorktree(conscriptId);
        this.worktreePaths.delete(conscriptId);
      } catch { /* OK */ }

      // Delete the feature branch
      if (branchName) {
        try {
          await gitService.deleteBranch(branchName);
        } catch { /* branch may already be gone */ }
      }
    }

    // Reset directive back to ready
    if (conscript.assignedDirectiveId) {
      const runs = dbService.listRuns(conscript.assignedDirectiveId);
      const lastRun = runs[runs.length - 1];
      if (lastRun) writeback.onWorkFailed(conscript.assignedDirectiveId, lastRun.id, 'Work scrapped by user. Branch deleted and changes discarded.').catch(() => {});
      dbService.updateDirective(conscript.assignedDirectiveId, { status: 'ready', assignedConscriptId: undefined });
    }

    // Reset conscript to idle
    dbService.updateConscript(conscriptId, { status: 'IDLE', assignedDirectiveId: undefined, branchName: undefined });
    this.broadcastStatus(conscriptId, 'IDLE');
    this.chatSend(conscriptId, 'Changes scrapped. Branch deleted and conscript reset.');
  }

  getConscriptInstance(conscriptId: string): ConscriptInstance | undefined {
    return this.conscripts.get(conscriptId);
  }

  getWorktreePath(conscriptId: string): string | undefined {
    return this.worktreePaths.get(conscriptId);
  }

  listActiveConscripts(): ConscriptInstance[] {
    return Array.from(this.conscripts.values());
  }

  private async autoCommitWorktree(conscriptId: string): Promise<void> {
    const worktreePath = this.worktreePaths.get(conscriptId);
    if (!worktreePath) return;

    const settings = getSettings();
    const projectDir = settings.git?.workingDirectory;
    if (!projectDir) return;

    const gitService = new GitService(projectDir);
    const hasChanges = await gitService.hasChanges(worktreePath);
    if (hasChanges) {
      debugLog(`[ConscriptManager] Auto-committing uncommitted work for ${conscriptId}`);
      await gitService.commitAll(worktreePath, 'chore: auto-commit conscript work for review');
    }
  }

  private wireEvents(instance: ConscriptInstance): void {
    instance.on('status-changed', (status: ConscriptStatus) => {
      this.broadcastStatus(instance.id, status);

      // Auto-commit uncommitted work when conscript reaches QA_READY
      // (QA checklist is generated in agent-instance before QA_READY transition)
      if (status === 'QA_READY') {
        this.autoCommitWorktree(instance.id).catch((err) => {
          debugLog(`[ConscriptManager] autoCommit failed for ${instance.id}: ${err}`);
        });
      }

      // Deathmark write-back hooks
      const conscript = dbService.getConscript(instance.id);
      if (conscript?.assignedDirectiveId) {
        const run = dbService.currentRun(instance.id);
        if (run) {
          if (status === 'DEVELOPING') writeback.onDevelopmentStarted(conscript.assignedDirectiveId, run.id).catch(() => {});
          if (status === 'QA_READY') writeback.onQAReady(conscript.assignedDirectiveId, run.id).catch(() => {});
          if (status === 'ERROR') {
            // Pull recent chat for error context
            const chat = dbService.chatHistory(instance.id);
            const lastSystemMsg = [...chat].reverse().find((m) => m.role === 'system' && m.content.toLowerCase().includes('error'));
            const reason = lastSystemMsg?.content || 'Agent encountered an unrecoverable error.';
            writeback.onWorkFailed(conscript.assignedDirectiveId, run.id, reason).catch(() => {});
          }
        }
      }

      if (isInterruptState(status)) {
        const conscriptRec = conscript || dbService.getConscript(instance.id);
        this.broadcast(IPC_CHANNELS.CONSCRIPT_NOTIFICATION, {
          conscriptId: instance.id,
          conscriptName: conscriptRec?.name || instance.name,
          status,
        });
      }
    });

    instance.on('chat-message', (msg: unknown) => {
      this.broadcast(IPC_CHANNELS.CHAT_ON_MESSAGE, msg);
    });

    instance.on('terminal-data', (data: string) => {
      this.broadcast(IPC_CHANNELS.CONSCRIPT_TERMINAL_DATA, {
        conscriptId: instance.id,
        data,
      });
    });
  }

  private broadcastStatus(conscriptId: string, status: ConscriptStatus): void {
    this.broadcast(IPC_CHANNELS.CONSCRIPT_STATUS_CHANGED, { conscriptId, status });
  }

  private broadcast(channel: string, data: unknown): void {
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send(channel, data);
    }
  }
}

// Singleton
export const conscriptManager = new ConscriptManager();
