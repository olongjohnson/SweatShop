import type { Ticket } from '../../shared/types';

export interface ExecutionPlan {
  parallelGroups: TicketGroup[];
}

export interface TicketGroup {
  tickets: Ticket[];
}

/**
 * Build an execution plan by topologically sorting tickets based on dependsOn.
 * Tickets at the same depth level (no dependencies between them) are grouped for parallel execution.
 */
export function buildExecutionPlan(tickets: Ticket[]): ExecutionPlan {
  const ticketMap = new Map<string, Ticket>();
  for (const t of tickets) ticketMap.set(t.id, t);

  // Calculate depth for each ticket (longest path from root)
  const depths = new Map<string, number>();

  function getDepth(id: string, visited: Set<string>): number {
    if (depths.has(id)) return depths.get(id)!;
    if (visited.has(id)) return 0; // cycle guard
    visited.add(id);

    const ticket = ticketMap.get(id);
    if (!ticket || ticket.dependsOn.length === 0) {
      depths.set(id, 0);
      return 0;
    }

    let maxDepth = 0;
    for (const depId of ticket.dependsOn) {
      // Only consider dependencies within our ticket set
      if (ticketMap.has(depId)) {
        maxDepth = Math.max(maxDepth, getDepth(depId, visited) + 1);
      }
    }

    depths.set(id, maxDepth);
    return maxDepth;
  }

  for (const t of tickets) {
    getDepth(t.id, new Set());
  }

  // Group tickets by depth level
  const groups = new Map<number, Ticket[]>();
  for (const t of tickets) {
    const depth = depths.get(t.id) ?? 0;
    if (!groups.has(depth)) groups.set(depth, []);
    groups.get(depth)!.push(t);
  }

  // Sort by depth level and build groups
  const sortedKeys = [...groups.keys()].sort((a, b) => a - b);
  const parallelGroups: TicketGroup[] = sortedKeys.map((key) => ({
    tickets: groups.get(key)!,
  }));

  return { parallelGroups };
}

export class TicketQueue {
  private plan: ExecutionPlan = { parallelGroups: [] };
  private currentGroupIndex = 0;
  private dispatched = new Set<string>();
  private completed = new Set<string>();

  enqueue(tickets: Ticket[]): void {
    this.plan = buildExecutionPlan(tickets);
    this.currentGroupIndex = 0;
    this.dispatched.clear();
    this.completed.clear();
  }

  /**
   * Get the next ticket that is ready to dispatch:
   * - In the current parallel group
   * - Not already dispatched
   * - All dependencies completed
   */
  dequeue(): Ticket | null {
    while (this.currentGroupIndex < this.plan.parallelGroups.length) {
      const group = this.plan.parallelGroups[this.currentGroupIndex];
      const allGroupDone = group.tickets.every((t) => this.completed.has(t.id));

      if (allGroupDone) {
        this.currentGroupIndex++;
        continue;
      }

      // Find an undispatched ticket in this group
      for (const ticket of group.tickets) {
        if (this.dispatched.has(ticket.id)) continue;
        if (this.completed.has(ticket.id)) continue;

        // Check dependencies are completed
        const depsReady = ticket.dependsOn.every((depId) => this.completed.has(depId));
        if (!depsReady) continue;

        return ticket;
      }

      // All tickets in this group are either dispatched or waiting — stop
      break;
    }
    return null;
  }

  markDispatched(ticketId: string): void {
    this.dispatched.add(ticketId);
  }

  markCompleted(ticketId: string): void {
    this.completed.add(ticketId);
  }

  isEmpty(): boolean {
    const allTickets = this.plan.parallelGroups.flatMap((g) => g.tickets);
    return allTickets.every((t) => this.completed.has(t.id));
  }

  getStatus(): { total: number; pending: number; inProgress: number; completed: number } {
    const allTickets = this.plan.parallelGroups.flatMap((g) => g.tickets);
    const total = allTickets.length;
    const completed = allTickets.filter((t) => this.completed.has(t.id)).length;
    const inProgress = allTickets.filter(
      (t) => this.dispatched.has(t.id) && !this.completed.has(t.id)
    ).length;
    const pending = total - completed - inProgress;
    return { total, pending, inProgress, completed };
  }
}
