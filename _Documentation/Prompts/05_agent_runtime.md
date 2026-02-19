# Prompt 05 — Agent Runtime (Claude SDK Integration)

## Context

You are working on **SweatShop**, an Electron desktop app. The data layer and story management are in place. We now need the core engine: spawning AI agents that can autonomously execute development tasks.

## Task

Build the agent runtime — the system that spawns, manages, and communicates with Claude-powered AI agents. Each agent runs as a managed process with scoped tools.

## Requirements

### 1. Install Dependencies

```
@anthropic-ai/sdk
uuid
```

### 2. Agent Manager (`src/main/services/agent-manager.ts`)

Central service that manages all active agent instances.

```ts
class AgentManager {
  private agents: Map<string, AgentInstance>;

  // Create a new agent (adds to DB + spawns runtime)
  async createAgent(name: string): Promise<Agent>;

  // Assign a ticket to an agent and start work
  async assignTicket(agentId: string, ticketId: string, config: {
    orgAlias: string;
    branchName: string;
    refinedPrompt: string;
  }): Promise<void>;

  // Send a message from the human to an agent
  async sendMessage(agentId: string, message: string): Promise<void>;

  // Approve the agent's work (triggers merge flow)
  async approveWork(agentId: string): Promise<void>;

  // Reject work with feedback (triggers rework)
  async rejectWork(agentId: string, feedback: string): Promise<void>;

  // Stop an agent
  async stopAgent(agentId: string): Promise<void>;

  // Get agent instance for status queries
  getAgent(agentId: string): AgentInstance | undefined;

  // List all active agents
  listAgents(): AgentInstance[];
}
```

### 3. Agent Instance (`src/main/services/agent-instance.ts`)

Each agent instance wraps a Claude API conversation with tool use.

```ts
class AgentInstance extends EventEmitter {
  readonly id: string;
  readonly name: string;
  private status: AgentStatus;
  private conversationHistory: Message[];
  private assignedOrg: string | null;
  private assignedBranch: string | null;
  private ticketId: string | null;
  private runId: string | null;
  private anthropic: Anthropic;

  // Events emitted:
  // 'status-changed' (newStatus: AgentStatus)
  // 'chat-message' (message: ChatMessage)
  // 'terminal-data' (data: string)
  // 'needs-input' (question: string)
  // 'work-complete' ()
  // 'error' (error: Error)

  constructor(id: string, name: string, apiKey: string);

  // Start the agent loop with a refined prompt
  async start(config: {
    ticketId: string;
    orgAlias: string;
    branchName: string;
    prompt: string;
  }): Promise<void>;

  // Process a human message (resumes the agent if waiting)
  async handleHumanMessage(message: string): Promise<void>;

  // The core agentic loop
  private async runAgentLoop(): Promise<void>;

  // Build tool definitions scoped to this agent
  private buildTools(): Tool[];
}
```

### 4. Agent Tool Definitions (`src/main/services/agent-tools.ts`)

Each agent gets a set of tools. **Tools are scoped** — they enforce that the agent can only operate on its assigned org and branch.

```ts
function buildAgentTools(config: {
  agentId: string;
  orgAlias: string;        // Locked to this org
  branchName: string;      // Locked to this branch
  workingDirectory: string; // Project root
}): ToolDefinition[] {
  return [
    {
      name: 'shell_exec',
      description: 'Execute a shell command. The command runs in the project directory. For Salesforce CLI commands, the target org is pre-configured — do not specify -o or --target-org flags.',
      // Implementation: spawns child_process.exec
      // GUARDRAIL: Injects --target-org={orgAlias} for any `sf` command
      // GUARDRAIL: Rejects `sf org delete`, `git push --force`, `rm -rf /`
    },
    {
      name: 'file_read',
      description: 'Read the contents of a file at the given path (relative to project root).',
      // Implementation: fs.readFile
    },
    {
      name: 'file_write',
      description: 'Write content to a file at the given path. Creates directories if needed.',
      // Implementation: fs.writeFile with mkdirp
    },
    {
      name: 'file_edit',
      description: 'Replace a specific string in a file with new content.',
      // Implementation: read, replace, write
    },
    {
      name: 'request_human_input',
      description: 'Ask the human a question. Use this when you need clarification, a decision, or approval. The agent will pause until the human responds.',
      // Implementation: emits 'needs-input' event, sets status to NEEDS_INPUT
      // Increments humanInterventionCount on the current run
    },
    {
      name: 'report_development_complete',
      description: 'Signal that development is complete and the code is ready for deployment and QA. This triggers the provisioning pipeline.',
      // Implementation: sets status to PROVISIONING, emits 'work-complete'
    },
  ];
}
```

### 5. The Agentic Loop (`runAgentLoop`)

The core execution loop:

```
1. Send the system prompt + refined ticket prompt to Claude
2. Claude responds with text and/or tool calls
3. For each tool call:
   a. Execute the tool with guardrails
   b. Emit terminal-data events for command output
   c. Emit chat-message events for notable actions
   d. Return tool results to Claude
4. If Claude calls request_human_input:
   a. Set status to NEEDS_INPUT
   b. Emit needs-input event
   c. PAUSE the loop — wait for handleHumanMessage()
   d. When human responds, add to conversation and continue
5. If Claude calls report_development_complete:
   a. Set status to PROVISIONING
   b. Break the loop — provisioning is handled externally
6. If Claude responds with text (no tool calls):
   a. Emit as chat-message
   b. Continue loop (Claude may have more to say/do)
7. Loop until: work complete, error, or agent stopped
```

### 6. System Prompt Template (`src/main/prompts/agent-system.ts`)

```ts
export function buildAgentSystemPrompt(config: {
  orgAlias: string;
  branchName: string;
  projectType: string; // 'salesforce'
}): string {
  return `You are a Salesforce development agent working on a specific ticket.

## Your Environment
- Target org: ${config.orgAlias} (pre-configured — do not change target org in commands)
- Feature branch: ${config.branchName}
- You are working in a Salesforce DX project

## Your Workflow
1. Read and understand the ticket requirements
2. Explore the existing codebase to understand patterns and conventions
3. Implement the solution
4. Commit your changes to the feature branch
5. When done, call report_development_complete

## Rules
- ALWAYS use the provided tools. Do not output raw code — write it to files.
- Use shell_exec for git and Salesforce CLI operations
- Follow existing code patterns and conventions you observe
- Write Apex with \`with sharing\` by default
- Use @AuraEnabled(cacheable=true) for read operations
- All LWC should use custom CSS variables, not SLDS utility classes
- If you're unsure about a requirement, call request_human_input
- Do NOT push to remote — just commit locally
- Do NOT delete the scratch org or modify org configuration
- Commit frequently with descriptive messages`;
}
```

### 7. Guardrails (`src/main/services/agent-guardrails.ts`)

Safety checks applied to tool executions:

```ts
// Before executing shell commands
function validateShellCommand(command: string, config: { orgAlias: string }): {
  allowed: boolean;
  modified?: string;  // Command with guardrails applied
  reason?: string;    // Why it was blocked
} {
  // BLOCK destructive commands
  const blocked = [
    /rm\s+-rf\s+\//,
    /git\s+push\s+--force/,
    /sf\s+org\s+delete/,
    /sf\s+org\s+create/,  // Agents don't create orgs — the controller does
    /format\s+[a-zA-Z]:/,
  ];

  // INJECT org targeting for sf commands
  // If command starts with 'sf' and doesn't specify -o/--target-org,
  // append --target-org=${orgAlias}

  // INJECT branch checkout if git commands target wrong branch
}

// Before writing files
function validateFileWrite(filePath: string): {
  allowed: boolean;
  reason?: string;
} {
  // BLOCK writes outside project directory
  // BLOCK writes to .git directory
  // BLOCK writes to node_modules
  // BLOCK writes to credentials/env files
}
```

### 8. Wire Up to IPC

Connect the AgentManager to IPC so the renderer can:
- `window.sweatshop.agents.create(name)` — create a new agent
- `window.sweatshop.agents.assign(agentId, ticketId)` — assign work
- `window.sweatshop.chat.send(agentId, message)` — send human message
- Listen for status changes, chat messages, terminal data via IPC events

### 9. Intervention Tracking

Every time an agent calls `request_human_input`:
1. Record an `InterventionEvent` on the current `TicketRun`
2. Start a timer (track how long the agent waits for human response)
3. When the human responds, record `waitDurationMs` and `humanResponse`
4. Increment `humanInterventionCount`

Every time the human calls `rejectWork`:
1. Increment `reworkCount` on the current run
2. Record an intervention event of type `rework`

## Acceptance Criteria

1. An agent can be created and shows as IDLE
2. Assigning a ticket starts the agentic loop — Claude receives the prompt and begins tool use
3. `shell_exec` runs commands and streams output via terminal-data events
4. `file_read` / `file_write` / `file_edit` work correctly
5. `request_human_input` pauses the loop, notifies the renderer, and resumes on human response
6. `report_development_complete` transitions to PROVISIONING
7. Guardrails block destructive commands
8. Guardrails inject correct `--target-org` for sf commands
9. Intervention events are recorded in the database
10. API key comes from settings — missing key shows clear error
