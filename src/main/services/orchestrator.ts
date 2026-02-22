import { EventEmitter } from 'events';
import { BrowserWindow } from 'electron';
import { DirectiveQueue, buildExecutionPlan } from './ticket-queue';
import { refineDirective } from './prompt-refiner';
import { conscriptManager } from './agent-manager';
import * as dbService from './database';
import { getSettings } from './settings';
import { IPC_CHANNELS } from '../../shared/ipc-channels';
import { pipelineExecutor } from './pipeline-executor';
import type { Directive, Conscript } from '../../shared/types';

export interface OrchestratorStatus {
  running: boolean;
  total: number;
  pending: number;
  inProgress: number;
  completed: number;
}

class OrchestratorService extends EventEmitter {
  private queue = new DirectiveQueue();
  private running = false;
  private pollTimer: ReturnType<typeof setTimeout> | null = null;

  /**
   * Load directives into the work queue.
   */
  async loadDirectives(directiveIds: string[]): Promise<void> {
    const directives: Directive[] = [];
    for (const id of directiveIds) {
      const directive = dbService.getDirective(id);
      if (directive) directives.push(directive);
    }
    this.queue.enqueue(directives);
    this.broadcastProgress();
  }

  /**
   * Start the dispatch loop.
   */
  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;
    this.broadcastProgress();
    this.dispatchLoop();
  }

  /**
   * Stop the dispatch loop gracefully.
   */
  async stop(): Promise<void> {
    this.running = false;
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
    this.broadcastProgress();
  }

  /**
   * Get current orchestrator status.
   */
  getStatus(): OrchestratorStatus {
    const queueStatus = this.queue.getStatus();
    return {
      running: this.running,
      ...queueStatus,
    };
  }

  /**
   * Called when a conscript completes (merged) or fails.
   */
  onDirectiveCompleted(directiveId: string): void {
    this.queue.markCompleted(directiveId);
    this.broadcastProgress();

    // If still running and queue not empty, try to dispatch more
    if (this.running && !this.queue.isEmpty()) {
      this.dispatchLoop();
    }

    if (this.queue.isEmpty()) {
      this.running = false;
      this.emit('complete');
      this.broadcastProgress();
    }
  }

  /**
   * Main dispatch loop — tries to assign ready directives to idle conscripts.
   */
  private async dispatchLoop(): Promise<void> {
    if (!this.running) return;

    let dispatched = false;

    // Keep dispatching as long as there are directives and conscripts available
    while (this.running) {
      const directive = this.queue.dequeue();
      if (!directive) break;

      const idleConscript = this.findIdleConscript();
      if (!idleConscript) break;

      try {
        await this.dispatch(directive, idleConscript);
        dispatched = true;
      } catch (err) {
        console.error(`[Orchestrator] Failed to dispatch directive ${directive.id}:`, err);
        // Put it back by not marking it dispatched
        break;
      }
    }

    // If we couldn't dispatch (no conscripts/directives), poll again in a few seconds
    if (this.running && !this.queue.isEmpty()) {
      this.pollTimer = setTimeout(() => this.dispatchLoop(), 5000);
    }
  }

  /**
   * Assign a single directive to a conscript.
   * If the directive has a workflowTemplateId, routes through the pipeline executor.
   */
  private async dispatch(directive: Directive, conscript: Conscript): Promise<void> {
    this.queue.markDispatched(directive.id);

    const settings = getSettings();
    const workingDirectory = settings.git?.workingDirectory || '';

    // Pipeline dispatch — run through workflow stages
    if (directive.workflowTemplateId) {
      const workflow = dbService.getWorkflowTemplate(directive.workflowTemplateId);
      if (workflow) {
        pipelineExecutor.execute(directive, workflow, conscript.id, workingDirectory)
          .then(() => this.onDirectiveCompleted(directive.id))
          .catch((err) => {
            console.error(`[Orchestrator] Pipeline failed for directive ${directive.id}:`, err);
            this.onDirectiveCompleted(directive.id);
          });
        this.broadcastProgress();
        return;
      }
    }

    // Default dispatch — existing behavior (refineDirective → assignDirective)
    const branchName = `feature/${directive.id}-${directive.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40)}`;

    const refinedPrompt = await refineDirective(directive);
    const campAlias = 'default';

    await conscriptManager.assignDirective(conscript.id, directive.id, {
      campAlias,
      branchName,
      refinedPrompt,
      workingDirectory,
    });

    this.broadcastProgress();
  }

  /**
   * Find an idle conscript.
   */
  private findIdleConscript(): Conscript | null {
    const conscripts = dbService.listConscripts();
    return conscripts.find((a) => a.status === 'IDLE') ?? null;
  }

  /**
   * Broadcast orchestrator progress to renderer.
   */
  private broadcastProgress(): void {
    const status = this.getStatus();
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send(IPC_CHANNELS.ORCHESTRATOR_PROGRESS, status);
    }
  }
}

// Singleton
export const orchestrator = new OrchestratorService();
