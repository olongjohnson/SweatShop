# Prompt 08 — Orchestrator

## Context

You are working on **SweatShop**, an Electron desktop app. Agents, chat, and terminal are functional. The orchestrator is the brain that takes tickets and dispatches them to agents as refined prompts.

## Task

Build the orchestrator: ticket-to-prompt refinement, dependency analysis, agent dispatch, and work queue management.

## Requirements

### 1. Orchestrator Service (`src/main/services/orchestrator.ts`)

```ts
class OrchestratorService {
  private queue: TicketQueue;
  private agentManager: AgentManager;
  private db: DatabaseService;
  private orgPool: OrgPoolService; // from prompt 11, stub for now

  // Load tickets into the work queue
  async loadTickets(ticketIds: string[]): Promise<void>;

  // Start processing the queue
  async start(): Promise<void>;

  // Stop processing (graceful — finish current agent work)
  async stop(): Promise<void>;

  // Main dispatch loop
  private async dispatchLoop(): Promise<void>;

  // Refine a ticket into an agent-ready prompt
  private async refineTicket(ticket: Ticket): Promise<string>;

  // Analyze dependencies and build execution graph
  private analyzeDependencies(tickets: Ticket[]): ExecutionPlan;

  // Check if a ticket can be started (dependencies met, agent available)
  private canDispatch(ticket: Ticket, plan: ExecutionPlan): boolean;

  // Assign a ticket to an available agent
  private async dispatch(ticket: Ticket): Promise<void>;
}
```

### 2. Execution Plan & Dependency Graph

```ts
interface ExecutionPlan {
  // Groups of tickets that can run in parallel
  parallelGroups: TicketGroup[];
  // Order: group[0] runs first, when all complete, group[1] starts, etc.
}

interface TicketGroup {
  tickets: Ticket[];
  // Within a group, all tickets are independent and can run concurrently
}

function buildExecutionPlan(tickets: Ticket[]): ExecutionPlan {
  // 1. Build a DAG from ticket.dependsOn relationships
  // 2. Topological sort to determine execution order
  // 3. Group tickets at the same depth level (no dependencies between them)
  // 4. Return ordered groups
  //
  // Example:
  //   A depends on nothing
  //   B depends on nothing
  //   C depends on A
  //   D depends on A and B
  //
  //   Group 1: [A, B]     (parallel)
  //   Group 2: [C, D]     (parallel, after A and B complete)
}
```

### 3. Prompt Refinement (`src/main/services/prompt-refiner.ts`)

Uses Claude to convert a ticket into a detailed, actionable agent prompt.

```ts
async function refineTicket(ticket: Ticket, context: {
  projectStructure?: string;    // ls output or file tree
  conventions?: string;         // Coding conventions
  relatedFiles?: string[];      // Files likely to be touched
}): Promise<string> {
  // Call Claude API with the ticket details and ask it to produce
  // a structured development prompt

  // The refined prompt should include:
  // 1. Clear objective (what to build)
  // 2. Acceptance criteria (how to verify)
  // 3. Files to examine first (if known)
  // 4. Patterns to follow (from conventions)
  // 5. What NOT to do (scope boundaries)

  // Store the refined prompt in the refined_prompts table
}
```

**System prompt for the refiner:**
```
You are a prompt engineer specializing in Salesforce development tasks.
Given a ticket (title, description, acceptance criteria), produce a detailed
development prompt that an AI agent can follow to implement the work.

The prompt should be:
- Specific and actionable (not vague)
- Include step-by-step approach
- Reference specific Salesforce patterns (Apex, LWC, metadata)
- Include test requirements if applicable
- Be self-contained (the agent has no other context beyond what you provide)
```

### 4. Dispatch Loop Logic

```
while (queue has unfinished tickets):
  1. Get the current parallel group (all dependencies met)
  2. For each ticket in the group that hasn't been dispatched:
     a. Check for available agents (status == IDLE)
     b. Check for available scratch orgs
     c. If both available:
        - Claim a scratch org
        - Create feature branch name
        - Refine the ticket into a prompt
        - Assign to agent
        - Update ticket status to 'in_progress'
     d. If no agent/org available: wait and retry
  3. When an agent completes (QA_READY → approved → merged):
     - Release the scratch org
     - Mark ticket as 'merged'
     - Check if all tickets in current group are done
     - If yes, advance to next group
  4. When an agent is rejected (rework):
     - Keep the ticket in_progress
     - Agent handles rework autonomously
  5. When all groups complete:
     - Emit 'orchestrator:complete' event
```

### 5. File Overlap Detection

Before dispatching, check if a ticket's likely file changes overlap with files being modified by an active agent:

```ts
async function detectFileOverlap(ticket: Ticket, activeAgents: Agent[]): Promise<{
  hasOverlap: boolean;
  conflictingAgent?: string;
  overlappingFiles?: string[];
}> {
  // Simple heuristic:
  // - Parse ticket description for file/component names
  // - Compare against files modified in active agents' branches (git diff --name-only)
  // If overlap detected, warn the orchestrator to serialize
}
```

This is best-effort — it won't catch all conflicts but will catch obvious ones.

### 6. Ticket Queue (`src/main/services/ticket-queue.ts`)

Simple priority queue:

```ts
class TicketQueue {
  // Add tickets to the queue
  enqueue(tickets: Ticket[]): void;

  // Get next ticket that's ready to dispatch (dependencies met)
  dequeue(completedTicketIds: string[]): Ticket | null;

  // Check if all work is done
  isEmpty(): boolean;

  // Get queue status for UI
  getStatus(): {
    total: number;
    pending: number;
    inProgress: number;
    completed: number;
  };
}
```

### 7. IPC Additions

```ts
// Renderer can control the orchestrator
orchestrator: {
  loadTickets: (ticketIds) => ipcRenderer.invoke('orchestrator:load', ticketIds),
  start: () => ipcRenderer.invoke('orchestrator:start'),
  stop: () => ipcRenderer.invoke('orchestrator:stop'),
  getStatus: () => ipcRenderer.invoke('orchestrator:status'),
  onProgress: (callback) => ipcRenderer.on('orchestrator:progress', (_, data) => callback(data)),
}
```

### 8. Orchestrator UI Integration

In the Stories view, add a "Dispatch Selected" button:
1. User selects tickets (checkboxes in the story list)
2. Clicks "Dispatch"
3. Orchestrator loads tickets, builds execution plan, starts dispatch loop
4. UI shows a small status bar: "Dispatching 5 tickets across 3 agents..."

## Acceptance Criteria

1. Orchestrator can accept a list of tickets and build an execution plan
2. Dependency analysis correctly orders tickets (topological sort)
3. Tickets with no dependencies are grouped for parallel execution
4. Prompt refinement produces detailed, actionable prompts from ticket data
5. Dispatch loop assigns tickets to idle agents with available orgs
6. When an agent completes, the next ticket from the queue is dispatched
7. File overlap detection warns about potential conflicts
8. Orchestrator status is visible in the UI
