# SweatShop — Workflow

## Current Workflow (Manual, Pre-SweatShop)

This is how Salesforce development works today — a single human managing a single AI agent:

### Step 1: Define Scope
- Human opens Cognito (Salesforce project management tool)
- Creates tickets with descriptions, acceptance criteria, labels, priority
- Organizes into sprints

### Step 2: Translate Ticket → Prompt
- Human reads the ticket
- Manually writes a prompt for the AI agent (Claude Code, Cursor, etc.)
- Includes relevant context: file paths, patterns, conventions, gotchas
- Pastes the prompt into the agent's chat

### Step 3: Agent Development
- Agent writes code, creates/modifies metadata
- Human monitors terminal output
- Human answers agent questions as they arise
- Human course-corrects when the agent drifts

### Step 4: Branch & Deploy
- Human (or agent at human direction) creates a feature branch
- Human triggers deployment to a scratch org
- Human manually runs scratch org provisioning (data load, users, permsets)

### Step 5: QA
- Human opens the scratch org in a browser
- Manually tests the feature
- If issues found → back to Step 3 with feedback
- If good → merge the branch

### Step 6: Repeat
- Pick up the next ticket
- Do it all again, serially

**Bottleneck:** The human is never writing code, but they're fully occupied managing *one* agent through *one* ticket. Nothing runs in parallel.

---

## SweatShop Workflow (Orchestrated, Parallel)

### Step 1: Define Scope (unchanged)
- Human defines tickets in Cognito — same as before
- SweatShop pulls tickets via Cognito integration

### Step 2: Orchestrator Refines & Dispatches
- SweatShop reads ticket data (title, description, criteria, dependencies)
- Orchestrator refines each ticket into a structured agent prompt
  - Injects codebase conventions, namespace rules, patterns
  - Adds relevant file context
  - Sets explicit scope boundaries
- Orchestrator analyzes dependencies:
  - Independent tickets → parallelized across agents
  - Dependent tickets → queued for sequential execution
- Orchestrator assigns each ticket to an agent + scratch org

### Step 3: Agents Work in Parallel
- Each agent autonomously:
  1. Creates a feature branch (`feature/<ticket-id>-<desc>`)
  2. Develops the solution (code, metadata, config)
  3. Commits work to the feature branch
- Human can observe any agent via the dashboard:
  - Switch between agent tabs
  - Read chat history
  - Watch terminal output
- Human intervenes only when an agent asks a question or gets stuck

### Step 4: Automated Provisioning
- When an agent finishes development, it triggers the provisioning script:
  1. Creates (or claims) a scratch org
  2. Deploys metadata from the feature branch
  3. Loads test data
  4. Creates users and assigns permission sets
  5. Reports the org login URL
- Agent status moves to `QA_READY`
- Dashboard notifies the human (visual indicator on the agent tab)

### Step 5: Human QA (Streamlined)
- Human clicks the notified agent tab
- Browser pane loads the scratch org
- Human tests the feature
- **Approve** → agent merges the branch; picks up next ticket if available
- **Reject** → human provides feedback in chat; agent enters `REWORK`

### Step 6: Continuous Flow
- As agents complete work, they pick up the next available ticket
- Multiple agents cycle through tickets concurrently
- Human reviews completed work as it surfaces — no idle time

---

## Workflow Comparison

| Aspect | Manual | SweatShop |
|---|---|---|
| Tickets processed | 1 at a time | N in parallel |
| Prompt creation | Manual, per ticket | Automated refinement |
| Branch management | Manual | Agent-managed |
| Scratch org setup | Manual CLI commands | Automated script |
| QA trigger | Human-initiated | Agent signals readiness |
| Agent monitoring | Single terminal window | Multi-agent dashboard |
| Org safety | Honor system | Enforced access controls |
| Human role | Agent babysitter | QA reviewer + tiebreaker |

## Human Touchpoints in SweatShop

The human's job shifts from "manage one agent" to "review completed work and make decisions":

1. **Ticket definition** — still human-authored in Cognito
2. **Launch** — kick off the orchestrator
3. **Answering agent questions** — agents surface blockers via chat
4. **QA review** — approve or reject completed work
5. **Conflict resolution** — when agents produce overlapping changes
