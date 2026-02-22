import * as dbService from './database';
import type { DirectiveRun } from '../../shared/types';

const DEFAULT_PRICING = {
  promptTokenRate: 15 / 1_000_000,
  completionTokenRate: 75 / 1_000_000,
};

export interface RunMetrics {
  directiveId: string;
  conscriptId: string;
  status: string;
  startedAt: string;
  completedAt?: string;
  wallClockDurationMs: number;
  activeDevTimeMs: number;
  humanWaitTimeMs: number;
  humanInterventionCount: number;
  reworkCount: number;
  promptTokensUsed: number;
  completionTokensUsed: number;
  estimatedCostUsd: number;
  autonomyScore: number;
}

export interface ConscriptMetrics {
  conscriptId: string;
  conscriptName: string;
  directivesCompleted: number;
  avgInterventionsPerDirective: number;
  avgReworkRate: number;
  avgDurationMs: number;
  totalTokensUsed: number;
  totalEstimatedCostUsd: number;
}

export interface SessionMetrics {
  totalDirectives: number;
  completedDirectives: number;
  failedDirectives: number;
  totalSessionTimeMs: number;
  totalHumanWaitTimeMs: number;
  totalActiveDevTimeMs: number;
  totalInterventions: number;
  totalReworks: number;
  firstPassApprovalRate: number;
  autonomyScore: number;
  velocity: number;
  humanEfficiencyRatio: number;
  totalCostUsd: number;
  costPerDirectiveUsd: number;
}

export interface TrendPoint {
  period: string;
  value: number;
}

function computeCost(promptTokens: number, completionTokens: number): number {
  return promptTokens * DEFAULT_PRICING.promptTokenRate
    + completionTokens * DEFAULT_PRICING.completionTokenRate;
}

function computeRunMetrics(run: DirectiveRun): RunMetrics {
  const startMs = new Date(run.startedAt).getTime();
  const endMs = run.completedAt ? new Date(run.completedAt).getTime() : Date.now();
  const wallClockDurationMs = endMs - startMs;

  const humanWaitTimeMs = run.interventions.reduce(
    (sum, i) => sum + (i.waitDurationMs || 0), 0
  );
  const activeDevTimeMs = Math.max(0, wallClockDurationMs - humanWaitTimeMs);

  const cost = computeCost(run.promptTokensUsed, run.completionTokensUsed);

  // Autonomy: 100 if no interventions, decreases with more
  // Simple formula: max(0, 100 - interventions * 15)
  const autonomyScore = Math.max(0, Math.round(100 - run.humanInterventionCount * 15));

  return {
    directiveId: run.directiveId,
    conscriptId: run.conscriptId,
    status: run.status,
    startedAt: run.startedAt,
    completedAt: run.completedAt,
    wallClockDurationMs,
    activeDevTimeMs,
    humanWaitTimeMs,
    humanInterventionCount: run.humanInterventionCount,
    reworkCount: run.reworkCount,
    promptTokensUsed: run.promptTokensUsed,
    completionTokensUsed: run.completionTokensUsed,
    estimatedCostUsd: cost,
    autonomyScore,
  };
}

class AnalyticsService {
  recordTokenUsage(runId: string, promptTokens: number, completionTokens: number): void {
    const run = dbService.getRun(runId);
    if (!run) return;

    dbService.updateRun(runId, {
      promptTokensUsed: run.promptTokensUsed + promptTokens,
      completionTokensUsed: run.completionTokensUsed + completionTokens,
    });
  }

  getRunMetrics(runId: string): RunMetrics | null {
    const run = dbService.getRun(runId);
    if (!run) return null;
    return computeRunMetrics(run);
  }

  getConscriptMetrics(conscriptId: string): ConscriptMetrics {
    const conscript = dbService.getConscript(conscriptId);
    const runs = dbService.listRuns().filter((r) => r.conscriptId === conscriptId);
    const completed = runs.filter((r) => r.status === 'completed');

    const metrics = runs.map(computeRunMetrics);
    const totalTokens = metrics.reduce(
      (sum, m) => sum + m.promptTokensUsed + m.completionTokensUsed, 0
    );
    const totalCost = metrics.reduce((sum, m) => sum + m.estimatedCostUsd, 0);

    return {
      conscriptId,
      conscriptName: conscript?.name || 'Unknown',
      directivesCompleted: completed.length,
      avgInterventionsPerDirective: runs.length > 0
        ? runs.reduce((s, r) => s + r.humanInterventionCount, 0) / runs.length
        : 0,
      avgReworkRate: runs.length > 0
        ? runs.reduce((s, r) => s + r.reworkCount, 0) / runs.length
        : 0,
      avgDurationMs: metrics.length > 0
        ? metrics.reduce((s, m) => s + m.wallClockDurationMs, 0) / metrics.length
        : 0,
      totalTokensUsed: totalTokens,
      totalEstimatedCostUsd: totalCost,
    };
  }

  getSessionMetrics(options?: { since?: string }): SessionMetrics {
    let runs = dbService.listRuns();

    if (options?.since) {
      const sinceMs = new Date(options.since).getTime();
      runs = runs.filter((r) => new Date(r.startedAt).getTime() >= sinceMs);
    }

    const metrics = runs.map(computeRunMetrics);
    const completed = runs.filter((r) => r.status === 'completed');
    const failed = runs.filter((r) => r.status === 'failed');

    const totalHumanWaitTimeMs = metrics.reduce((s, m) => s + m.humanWaitTimeMs, 0);
    const totalActiveDevTimeMs = metrics.reduce((s, m) => s + m.activeDevTimeMs, 0);
    const totalInterventions = runs.reduce((s, r) => s + r.humanInterventionCount, 0);
    const totalReworks = runs.reduce((s, r) => s + r.reworkCount, 0);
    const totalCost = metrics.reduce((s, m) => s + m.estimatedCostUsd, 0);

    // Session time: first start to last end
    let totalSessionTimeMs = 0;
    if (runs.length > 0) {
      const starts = runs.map((r) => new Date(r.startedAt).getTime());
      const ends = runs.map((r) => r.completedAt ? new Date(r.completedAt).getTime() : Date.now());
      totalSessionTimeMs = Math.max(...ends) - Math.min(...starts);
    }

    // First pass approval: completed directives with 0 rework
    const firstPassCount = completed.filter((r) => r.reworkCount === 0).length;
    const firstPassApprovalRate = completed.length > 0
      ? firstPassCount / completed.length
      : 0;

    // Autonomy
    const avgAutonomy = metrics.length > 0
      ? metrics.reduce((s, m) => s + m.autonomyScore, 0) / metrics.length
      : 100;

    // Velocity: directives per hour
    const sessionHours = totalSessionTimeMs / (1000 * 60 * 60);
    const velocity = sessionHours > 0 ? completed.length / sessionHours : 0;

    // Human efficiency
    const humanEfficiencyRatio = totalHumanWaitTimeMs > 0
      ? totalActiveDevTimeMs / totalHumanWaitTimeMs
      : totalActiveDevTimeMs > 0 ? Infinity : 0;

    return {
      totalDirectives: runs.length,
      completedDirectives: completed.length,
      failedDirectives: failed.length,
      totalSessionTimeMs,
      totalHumanWaitTimeMs,
      totalActiveDevTimeMs,
      totalInterventions,
      totalReworks,
      firstPassApprovalRate,
      autonomyScore: Math.round(avgAutonomy),
      velocity: Math.round(velocity * 10) / 10,
      humanEfficiencyRatio: Math.round(humanEfficiencyRatio * 10) / 10,
      totalCostUsd: Math.round(totalCost * 100) / 100,
      costPerDirectiveUsd: completed.length > 0
        ? Math.round((totalCost / completed.length) * 100) / 100
        : 0,
    };
  }

  getTrend(metric: string, options: { period: 'day' | 'week'; count: number }): TrendPoint[] {
    const runs = dbService.listRuns();
    const metrics = runs.map(computeRunMetrics);
    const points: TrendPoint[] = [];
    const now = Date.now();
    const periodMs = options.period === 'day' ? 86400000 : 604800000;

    for (let i = options.count - 1; i >= 0; i--) {
      const start = now - (i + 1) * periodMs;
      const end = now - i * periodMs;
      const periodRuns = metrics.filter((m) => {
        const ms = new Date(m.startedAt).getTime();
        return ms >= start && ms < end;
      });

      let value = 0;
      switch (metric) {
        case 'interventions':
          value = periodRuns.reduce((s, m) => s + m.humanInterventionCount, 0);
          break;
        case 'autonomy':
          value = periodRuns.length > 0
            ? periodRuns.reduce((s, m) => s + m.autonomyScore, 0) / periodRuns.length
            : 0;
          break;
        case 'cost':
          value = periodRuns.reduce((s, m) => s + m.estimatedCostUsd, 0);
          break;
        case 'directives':
          value = periodRuns.filter((m) => m.status === 'completed').length;
          break;
        default:
          break;
      }

      const date = new Date(end);
      const label = options.period === 'day'
        ? `${date.getMonth() + 1}/${date.getDate()}`
        : `W${Math.ceil((date.getDate()) / 7)}`;
      points.push({ period: label, value: Math.round(value * 100) / 100 });
    }

    return points;
  }

  exportMetrics(options?: { since?: string }): string {
    const session = this.getSessionMetrics(options);
    let runs = dbService.listRuns();
    if (options?.since) {
      const sinceMs = new Date(options.since).getTime();
      runs = runs.filter((r) => new Date(r.startedAt).getTime() >= sinceMs);
    }
    const runMetrics = runs.map(computeRunMetrics);

    return JSON.stringify({ session, runs: runMetrics }, null, 2);
  }
}

export const analytics = new AnalyticsService();
