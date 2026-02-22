import type { Directive } from '../../shared/types';

export interface ExecutionPlan {
  parallelGroups: DirectiveGroup[];
}

export interface DirectiveGroup {
  directives: Directive[];
}

/**
 * Build an execution plan by topologically sorting directives based on dependsOn.
 * Directives at the same depth level (no dependencies between them) are grouped for parallel execution.
 */
export function buildExecutionPlan(directives: Directive[]): ExecutionPlan {
  const directiveMap = new Map<string, Directive>();
  for (const t of directives) directiveMap.set(t.id, t);

  // Calculate depth for each directive (longest path from root)
  const depths = new Map<string, number>();

  function getDepth(id: string, visited: Set<string>): number {
    if (depths.has(id)) return depths.get(id)!;
    if (visited.has(id)) return 0; // cycle guard
    visited.add(id);

    const directive = directiveMap.get(id);
    if (!directive || directive.dependsOn.length === 0) {
      depths.set(id, 0);
      return 0;
    }

    let maxDepth = 0;
    for (const depId of directive.dependsOn) {
      // Only consider dependencies within our directive set
      if (directiveMap.has(depId)) {
        maxDepth = Math.max(maxDepth, getDepth(depId, visited) + 1);
      }
    }

    depths.set(id, maxDepth);
    return maxDepth;
  }

  for (const t of directives) {
    getDepth(t.id, new Set());
  }

  // Group directives by depth level
  const groups = new Map<number, Directive[]>();
  for (const t of directives) {
    const depth = depths.get(t.id) ?? 0;
    if (!groups.has(depth)) groups.set(depth, []);
    groups.get(depth)!.push(t);
  }

  // Sort by depth level and build groups
  const sortedKeys = [...groups.keys()].sort((a, b) => a - b);
  const parallelGroups: DirectiveGroup[] = sortedKeys.map((key) => ({
    directives: groups.get(key)!,
  }));

  return { parallelGroups };
}

export class DirectiveQueue {
  private plan: ExecutionPlan = { parallelGroups: [] };
  private currentGroupIndex = 0;
  private dispatched = new Set<string>();
  private completed = new Set<string>();

  enqueue(directives: Directive[]): void {
    this.plan = buildExecutionPlan(directives);
    this.currentGroupIndex = 0;
    this.dispatched.clear();
    this.completed.clear();
  }

  /**
   * Get the next directive that is ready to dispatch:
   * - In the current parallel group
   * - Not already dispatched
   * - All dependencies completed
   */
  dequeue(): Directive | null {
    while (this.currentGroupIndex < this.plan.parallelGroups.length) {
      const group = this.plan.parallelGroups[this.currentGroupIndex];
      const allGroupDone = group.directives.every((t) => this.completed.has(t.id));

      if (allGroupDone) {
        this.currentGroupIndex++;
        continue;
      }

      // Find an undispatched directive in this group
      for (const directive of group.directives) {
        if (this.dispatched.has(directive.id)) continue;
        if (this.completed.has(directive.id)) continue;

        // Check dependencies are completed
        const depsReady = directive.dependsOn.every((depId) => this.completed.has(depId));
        if (!depsReady) continue;

        return directive;
      }

      // All directives in this group are either dispatched or waiting — stop
      break;
    }
    return null;
  }

  markDispatched(directiveId: string): void {
    this.dispatched.add(directiveId);
  }

  markCompleted(directiveId: string): void {
    this.completed.add(directiveId);
  }

  isEmpty(): boolean {
    const allDirectives = this.plan.parallelGroups.flatMap((g) => g.directives);
    return allDirectives.every((t) => this.completed.has(t.id));
  }

  getStatus(): { total: number; pending: number; inProgress: number; completed: number } {
    const allDirectives = this.plan.parallelGroups.flatMap((g) => g.directives);
    const total = allDirectives.length;
    const completed = allDirectives.filter((t) => this.completed.has(t.id)).length;
    const inProgress = allDirectives.filter(
      (t) => this.dispatched.has(t.id) && !this.completed.has(t.id)
    ).length;
    const pending = total - completed - inProgress;
    return { total, pending, inProgress, completed };
  }
}
