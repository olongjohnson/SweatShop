# Prompt 13 — Analytics & Metrics

## Context

You are working on **SweatShop**, an Electron desktop app. The full agent lifecycle is operational. We now need to track, aggregate, and display metrics so the human can measure agent effectiveness, identify bottlenecks, and improve over time.

## Why This Matters

The point of SweatShop is to shift the human from "agent babysitter" to "QA reviewer." Analytics answer the critical question: **Is that actually happening?** If human intervention count stays high, we need better prompts. If rework count is high, agents need better acceptance criteria. If wait time dominates, the human is the bottleneck.

## Task

Build the analytics tracking layer, aggregation service, and analytics dashboard view.

## Metrics to Track

### Per-Ticket Run Metrics (already in `ticket_runs` table)

| Metric | Field | Why It Matters |
|---|---|---|
| **Human intervention count** | `human_intervention_count` | Core autonomy metric. Lower = more autonomous agent. |
| **Rework count** | `rework_count` | QA rejection rate. High = poor initial work quality. |
| **Start time** | `started_at` | When the agent began work. |
| **End time** | `completed_at` | When work was merged (or failed). |
| **Wall clock duration** | derived: `completed_at - started_at` | Total calendar time per ticket. |
| **Active dev time** | derived: total time minus wait time | Time the agent spent actually working. |
| **Human wait time** | derived: sum of `interventions[].waitDurationMs` | How long agents waited for human responses. The human's "cost." |
| **Prompt tokens used** | `prompt_tokens_used` | Input token cost. |
| **Completion tokens used** | `completion_tokens_used` | Output token cost. |
| **Total cost** | derived: tokens × price per token | Dollar cost per ticket. |

### Per-Ticket Run — Detailed Intervention Log (already in `interventions` JSON field)

Each intervention captures:
```ts
{
  timestamp: string;
  type: 'question' | 'rework' | 'guidance' | 'error_recovery';
  agentMessage: string;
  humanResponse?: string;
  waitDurationMs: number;
}
```

### Per-Agent Metrics (aggregated from runs)

| Metric | Derivation | Why |
|---|---|---|
| **Tickets completed** | count of completed runs | Volume measure. |
| **Average interventions per ticket** | mean(human_intervention_count) | Agent efficiency trend. |
| **Average rework rate** | mean(rework_count) | Quality trend. |
| **Average duration per ticket** | mean(wall_clock_duration) | Speed trend. |
| **Total tokens consumed** | sum(prompt + completion tokens) | Cumulative cost. |

### Session Metrics (aggregated across all agents in a dispatch batch)

| Metric | Derivation | Why |
|---|---|---|
| **Total tickets dispatched** | count | Throughput. |
| **Total tickets completed** | count where status=completed | Success rate. |
| **Parallelism achieved** | max concurrent agents active | Are we actually using multiple agents? |
| **Total session time** | last ticket completed - first ticket started | End-to-end duration. |
| **Human time invested** | sum of all wait durations + QA review time | Real human cost. |
| **Agent autonomy score** | `1 - (total_interventions / total_tool_calls)` | Single number: how self-sufficient were agents? |
| **First-pass approval rate** | tickets approved without rework / total | Quality score. |
| **Total cost** | sum of all ticket costs | Budget tracking. |

### Derived "Health" Metrics (recommendations)

These are my recommendations for higher-level indicators:

1. **Autonomy Score** (0-100): `100 × (1 - interventions / total_actions)` per ticket, averaged across all tickets. Target: >80.

2. **Velocity** (tickets/hour): completed tickets ÷ session hours. Track over time to see if we're getting faster.

3. **Cost per ticket**: total API cost ÷ tickets completed. Track trend — should decrease as prompts improve.

4. **Human efficiency**: `active_agent_time / human_wait_time`. If agents work 10 hours total but human only waited 30 min, that's a 20:1 ratio — great leverage.

5. **Prompt quality score**: `1 - (rework_count / tickets)`. If no tickets need rework, prompts are perfect.

6. **Bottleneck indicator**: Compare `human_wait_time` vs `active_dev_time`. If wait time dominates, the human is the bottleneck. If dev time dominates, agents are slow.

## Requirements

### 1. Analytics Service (`src/main/services/analytics.ts`)

```ts
class AnalyticsService {
  private db: DatabaseService;

  // Record token usage for a run (called after each Claude API response)
  recordTokenUsage(runId: string, promptTokens: number, completionTokens: number): void;

  // Get metrics for a specific run
  getRunMetrics(runId: string): RunMetrics;

  // Get aggregated metrics for an agent
  getAgentMetrics(agentId: string): AgentMetrics;

  // Get session-level metrics (all runs in a time range or dispatch batch)
  getSessionMetrics(options?: {
    since?: string;  // ISO timestamp
    batchId?: string;
  }): SessionMetrics;

  // Get trend data (metrics over time, for charts)
  getTrend(metric: string, options: {
    period: 'day' | 'week' | 'month';
    count: number; // how many periods back
  }): TrendPoint[];

  // Export metrics as JSON (for external analysis)
  exportMetrics(options?: { since?: string }): string;
}

interface RunMetrics {
  ticketId: string;
  agentId: string;
  status: string;
  startedAt: string;
  completedAt?: string;
  wallClockDurationMs: number;
  activeDevTimeMs: number;      // wall clock minus human wait time
  humanWaitTimeMs: number;       // sum of intervention wait durations
  humanInterventionCount: number;
  reworkCount: number;
  promptTokensUsed: number;
  completionTokensUsed: number;
  estimatedCostUsd: number;      // tokens × rate
  interventions: InterventionEvent[];
  autonomyScore: number;         // 0-100
}

interface AgentMetrics {
  agentId: string;
  agentName: string;
  ticketsCompleted: number;
  avgInterventionsPerTicket: number;
  avgReworkRate: number;
  avgDurationMs: number;
  totalTokensUsed: number;
  totalEstimatedCostUsd: number;
}

interface SessionMetrics {
  totalTickets: number;
  completedTickets: number;
  failedTickets: number;
  totalSessionTimeMs: number;
  totalHumanWaitTimeMs: number;
  totalActiveDevTimeMs: number;
  maxConcurrentAgents: number;
  totalInterventions: number;
  totalReworks: number;
  firstPassApprovalRate: number; // 0-1
  autonomyScore: number;        // 0-100
  velocity: number;             // tickets per hour
  humanEfficiencyRatio: number; // active_dev_time / human_wait_time
  totalCostUsd: number;
  costPerTicketUsd: number;
}

interface TrendPoint {
  period: string;    // "2026-02-18", "Week 8", etc.
  value: number;
}
```

### 2. Cost Calculation

Use current Claude API pricing (configurable in settings):

```ts
const DEFAULT_PRICING = {
  // Claude Opus 4
  promptTokenRate: 15 / 1_000_000,      // $15 per 1M input tokens
  completionTokenRate: 75 / 1_000_000,   // $75 per 1M output tokens
};
```

Allow override in settings for different models/tiers.

### 3. Token Tracking Integration

Update `agent-instance.ts` to record tokens after each Claude API call:

```ts
// After each API response
const response = await anthropic.messages.create({...});
analytics.recordTokenUsage(
  this.runId,
  response.usage.input_tokens,
  response.usage.output_tokens
);
```

### 4. Analytics Dashboard View (`src/renderer/views/AnalyticsView.tsx`)

Accessible from a chart icon in the title bar (next to Stories 📋 and Settings ⚙).

**Layout:**

```
┌──────────────────────────────────────────────────────────────┐
│ Analytics                              [Export JSON] [📅]    │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐          │
│  │ 87/100  │ │  4.2/hr │ │  $2.34  │ │  82%    │          │
│  │Autonomy │ │Velocity │ │Per Ticket│ │1st Pass │          │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘          │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │          Interventions Over Time (bar chart)           │  │
│  │  █                                                     │  │
│  │  █ █                                                   │  │
│  │  █ █   █                                               │  │
│  │  █ █ █ █ █                                             │  │
│  │  ─────────────────────────                             │  │
│  │  T1  T2  T3  T4  T5                                   │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌─────────────────────────┐ ┌──────────────────────────┐   │
│  │ Time Breakdown (pie)    │ │ Recent Runs (table)      │   │
│  │  ▓▓▓ Active dev: 78%   │ │ TICKET-001  ✓  3 int  2m │   │
│  │  ░░░ Human wait: 12%   │ │ TICKET-002  ✓  1 int  5m │   │
│  │  ▒▒▒ Provisioning: 10% │ │ TICKET-003  ✗  5 int  8m │   │
│  └─────────────────────────┘ └──────────────────────────┘   │
└──────────────────────────────────────────────────────────────┘
```

**Components:**

1. **Metric Cards** (top row): Autonomy score, velocity, cost per ticket, first-pass approval rate. Color-coded (green = good, yellow = okay, red = needs attention).

2. **Interventions Chart**: Bar chart showing human intervention count per ticket. Helps identify which tickets needed the most hand-holding.

3. **Time Breakdown**: Pie or donut chart showing how time was spent: active dev vs. human wait vs. provisioning.

4. **Recent Runs Table**: Sortable table of recent ticket runs with key metrics per row.

**Charting:** Use a lightweight charting library:
- `recharts` (React-native, good API) — recommended
- Or render simple charts with SVG/CSS (no dependency needed for basic bars/pies)

### 5. IPC Additions

```ts
analytics: {
  getRunMetrics: (runId) => ipcRenderer.invoke('analytics:run', runId),
  getAgentMetrics: (agentId) => ipcRenderer.invoke('analytics:agent', agentId),
  getSessionMetrics: (options) => ipcRenderer.invoke('analytics:session', options),
  getTrend: (metric, options) => ipcRenderer.invoke('analytics:trend', metric, options),
  export: (options) => ipcRenderer.invoke('analytics:export', options),
}
```

### 6. Install Dependencies

```
recharts (for charts)
```

Or skip the dependency and use SVG-based simple charts — your call based on complexity.

## Acceptance Criteria

1. Token usage is recorded after every Claude API call
2. Human intervention count increments correctly on `request_human_input`
3. Wait duration is tracked (time between agent question and human response)
4. Rework count increments on each QA rejection
5. Start/end times are recorded per ticket run
6. RunMetrics includes all derived fields (wall clock, active dev, wait time, cost, autonomy)
7. SessionMetrics aggregates correctly across all runs
8. Analytics dashboard shows metric cards, intervention chart, time breakdown, and recent runs
9. Metrics persist in SQLite and survive app restarts
10. Export to JSON works
11. Cost estimate is reasonable (within order of magnitude of actual API charges)
