import { EventEmitter } from 'events';
import { BrowserWindow } from 'electron';
import { TicketQueue, buildExecutionPlan } from './ticket-queue';
import { refineTicket } from './prompt-refiner';
import { agentManager } from './agent-manager';
import * as dbService from './database';
import { IPC_CHANNELS } from '../../shared/ipc-channels';
import type { Ticket, Agent } from '../../shared/types';

export interface OrchestratorStatus {
  running: boolean;
  total: number;
  pending: number;
  inProgress: number;
  completed: number;
}

class OrchestratorService extends EventEmitter {
  private queue = new TicketQueue();
  private running = false;
  private pollTimer: ReturnType<typeof setTimeout> | null = null;

  /**
   * Load tickets into the work queue.
   */
  async loadTickets(ticketIds: string[]): Promise<void> {
    const tickets: Ticket[] = [];
    for (const id of ticketIds) {
      const ticket = dbService.getTicket(id);
      if (ticket) tickets.push(ticket);
    }
    this.queue.enqueue(tickets);
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
   * Called when an agent completes (merged) or fails.
   */
  onTicketCompleted(ticketId: string): void {
    this.queue.markCompleted(ticketId);
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
   * Main dispatch loop — tries to assign ready tickets to idle agents.
   */
  private async dispatchLoop(): Promise<void> {
    if (!this.running) return;

    let dispatched = false;

    // Keep dispatching as long as there are tickets and agents available
    while (this.running) {
      const ticket = this.queue.dequeue();
      if (!ticket) break;

      const idleAgent = this.findIdleAgent();
      if (!idleAgent) break;

      try {
        await this.dispatch(ticket, idleAgent);
        dispatched = true;
      } catch (err) {
        console.error(`[Orchestrator] Failed to dispatch ticket ${ticket.id}:`, err);
        // Put it back by not marking it dispatched
        break;
      }
    }

    // If we couldn't dispatch (no agents/tickets), poll again in a few seconds
    if (this.running && !this.queue.isEmpty()) {
      this.pollTimer = setTimeout(() => this.dispatchLoop(), 5000);
    }
  }

  /**
   * Assign a single ticket to an agent.
   */
  private async dispatch(ticket: Ticket, agent: Agent): Promise<void> {
    this.queue.markDispatched(ticket.id);

    // Create branch name from ticket title
    const branchName = `feature/${ticket.id}-${ticket.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40)}`;

    // Refine the ticket into an actionable prompt
    const refinedPrompt = await refineTicket(ticket);

    // Use a stub working directory (will come from org pool in prompt 11)
    const workingDirectory = process.cwd();

    // Use a stub org alias (will come from org pool in prompt 11)
    const orgAlias = 'default';

    // Assign to agent
    await agentManager.assignTicket(agent.id, ticket.id, {
      orgAlias,
      branchName,
      refinedPrompt,
      workingDirectory,
    });

    this.broadcastProgress();
  }

  /**
   * Find an idle agent.
   */
  private findIdleAgent(): Agent | null {
    const agents = dbService.listAgents();
    return agents.find((a) => a.status === 'IDLE') ?? null;
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
