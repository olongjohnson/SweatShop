# SweatShop — Architecture

## System Layers

```
┌─────────────────────────────────────────────────────┐
│                   Dashboard UI                       │
│  (agent panels, chat, terminal, browser, switching)  │
├─────────────────────────────────────────────────────┤
│                   Orchestrator                       │
│  (ticket intake, prompt refinement, work dispatch)   │
├──────────────┬──────────────┬───────────────────────┤
│   Agent 1    │   Agent 2    │   Agent N ...          │
│  (branch,    │  (branch,    │  (branch,             │
│   develop,   │   develop,   │   develop,            │
│   provision) │   provision) │   provision)          │
├──────────────┴──────────────┴───────────────────────┤
│               Org Access Controller                  │
│  (agent → org mapping, lease management, limits)     │
├─────────────────────────────────────────────────────┤
│              Infrastructure Services                 │
│  (Git, Salesforce CLI, Scratch Org Pool, AI API)     │
└─────────────────────────────────────────────────────┘
```

## Component Details

### 1. Cognito Integration Layer

Connects to our Salesforce-native project management tool to pull tickets.

**Inputs:**
- Ticket title, description, acceptance criteria
- Labels, priority, sprint assignment
- Dependencies between tickets

**Outputs:**
- Structured ticket objects ready for the orchestrator

### 2. Orchestrator

The central decision-maker. Receives tickets and produces an execution plan.

**Responsibilities:**
- **Prompt Refinement** — Converts ticket data into detailed, agent-executable prompts. Adds relevant codebase context, conventions, and constraints.
- **Dependency Analysis** — Determines which tickets can run in parallel vs. which must be sequential.
- **Agent Dispatch** — Assigns refined prompts to available agents.
- **Org Assignment** — Works with the Org Access Controller to assign each agent a scratch org.
- **Progress Tracking** — Monitors agent status and surfaces events to the dashboard.

### 3. Agent

Each agent is an isolated development session. Agents are stateful — they maintain context across their entire ticket lifecycle.

**Agent Lifecycle:**

```
IDLE → ASSIGNED → BRANCHING → DEVELOPING → PROVISIONING → QA_READY → MERGING → IDLE
                                                ↑               │
                                                └── REWORK ◄────┘
                                                (human rejects)
```

**States:**
| State | Description |
|---|---|
| `IDLE` | No active ticket. Available for dispatch. |
| `ASSIGNED` | Ticket received, prompt loaded. |
| `BRANCHING` | Creating feature branch from target base. |
| `DEVELOPING` | Writing code, metadata, configuration. |
| `PROVISIONING` | Running scratch org setup script. |
| `QA_READY` | Work complete. Waiting for human review. |
| `MERGING` | Human approved. Merging branch to target. |
| `REWORK` | Human rejected. Agent addressing feedback. |

**Each agent has:**
- Its own chat channel (user ↔ agent communication)
- Its own terminal stream (command output)
- An assigned scratch org (via Org Access Controller)
- A feature branch (created at `BRANCHING`)

### 4. Org Access Controller

Manages the pool of available scratch orgs and enforces strict access rules.

**Rules:**
- An agent MUST be assigned an org before it can deploy.
- Only ONE agent may write to a given org at a time.
- Org assignments are explicit — no implicit/default org access.
- The controller tracks org lifecycle: available → leased → in-use → released.
- Org limits are configurable (dev vs. production environments).

**Org Provisioning Script:**
When an agent reaches `PROVISIONING`, it runs a standardized script that:
1. Creates a scratch org (or claims one from a pre-warmed pool)
2. Deploys metadata from the agent's feature branch
3. Loads test data (seed records, sample configurations)
4. Creates/assigns users
5. Assigns permission sets
6. Outputs the org login URL for QA

### 5. Dashboard UI

Multi-agent monitoring and interaction surface.

**Layout per agent:**
```
┌───────────────────────────────────────────────────────────────┐
│  [Agent 1] [Agent 2*] [Agent 3]            (* = needs input) │
├────────────────┬──────────────────────────────────────────────┤
│                │                                              │
│   Chat Pane    │              Browser Pane                    │
│                │           (scratch org UI)                   │
│   - messages   │                                              │
│   - input      │           ~ 70% of width                    │
│                │                                              │
├────────────────┤                                              │
│                │                                              │
│ Terminal Pane  │                                              │
│  - live output │                                              │
│                │                                              │
└────────────────┴──────────────────────────────────────────────┘
```

**Key behaviors:**
- Tab bar across the top for agent switching
- Visual indicator (badge, color, animation) when a background agent reaches `QA_READY` or needs input
- Browser pane takes the largest portion of the screen — this is where QA happens
- Chat and terminal are stacked on the left sidebar

### 6. Git Integration

**Per-agent branching strategy:**
- Agent creates `feature/<ticket-id>-<short-description>` from the configured base branch
- All agent work is committed to this branch
- On approval, the branch is merged back (merge strategy TBD — squash vs. merge commit)
- On rejection + rework, agent continues on the same branch

**Conflict handling:**
- If multiple agents touch overlapping files, the orchestrator should detect this during dispatch and either serialize those tickets or flag the risk.

## Security & Isolation

| Concern | Mitigation |
|---|---|
| Agent writes to wrong org | Org Access Controller enforces 1:1 agent→org mapping |
| Agent modifies wrong branch | Agents are sandboxed to their assigned feature branch |
| Agent exceeds scope | Prompt includes explicit boundaries; orchestrator reviews |
| Org limit exceeded | Controller tracks limits and blocks new provisioning |
