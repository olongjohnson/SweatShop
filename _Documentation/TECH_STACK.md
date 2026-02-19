# SweatShop — Technology Stack

## Platform Decision: Desktop App (Electron)

SweatShop is a **desktop application** built with **Electron**. This is driven by one hard requirement: we need an embedded browser pane that can load Salesforce scratch orgs for QA. Electron's `BrowserView` / `<webview>` tag is the most mature solution for embedding a full browser context inside an app alongside custom UI.

| Alternative | Why not |
|---|---|
| Tauri | Webview2-based, but limited control over embedded browser contexts. Salesforce session handling may be problematic. |
| Pure web app | Can't embed a Salesforce org in an iframe (X-Frame-Options). Need a real browser context. |
| VS Code Extension | Too constrained — we need full control over layout, multiple terminals, and the browser pane. |

## Core Stack

| Layer | Technology | Role |
|---|---|---|
| **Desktop shell** | Electron | Window management, webviews, process lifecycle |
| **Frontend** | React + TypeScript | Dashboard UI (chat, terminal, tab bar, controls) |
| **Backend** | Node.js (Electron main process) | Orchestrator, agent management, state, IPC |
| **AI Agents** | Claude Agent SDK | Each agent is an Agent SDK instance with custom tools |
| **Terminal emulator** | xterm.js | Embedded terminal panes mirroring agent shell sessions |
| **Persistence** | SQLite (better-sqlite3) | Agent state, org pool, ticket queue, run history |
| **Salesforce API** | JSForce | Pull tickets from Cognito, query org metadata |
| **Salesforce CLI** | `sf` CLI (spawned) | Org creation, source deploy, data loading, user setup |
| **Git** | `git` CLI (spawned) | Branch creation, commits, merges |
| **IPC** | Electron IPC + event emitter | Main ↔ renderer communication |

## Component Breakdown

### 1. Electron Main Process (Orchestrator + Backend)

The main process runs the orchestrator and manages all agents as child processes.

```
Main Process
├── OrchestratorService      — ticket intake, prompt refinement, dispatch
├── AgentManager             — spawn/stop/monitor agent processes
├── OrgPoolService           — scratch org lifecycle, access control
├── CognitoService           — JSForce connection to pull tickets
├── GitService               — branch operations via spawned git
├── StateStore (SQLite)      — persistent state for all entities
└── IPC handlers             — bridge to renderer process
```

**Why main process?** The orchestrator needs to manage OS-level resources (child processes, file system, CLI tools). Electron's main process has full Node.js access.

### 2. Electron Renderer Process (Dashboard UI)

React app running in the renderer. Communicates with main process via Electron IPC.

```
Renderer (React)
├── AgentTabBar              — tab switching, status badges
├── AgentPanel               — per-agent view container
│   ├── ChatPane             — message history + input
│   ├── TerminalPane         — xterm.js instance
│   └── BrowserPane          — Electron BrowserView wrapper
├── OrchestratorView         — ticket queue, dependency graph (future)
├── NotificationSystem       — toasts, badges for interrupt states
└── StateSync (IPC)          — real-time state from main process
```

### 3. Claude Agent SDK — Agent Runtime

Each agent is a **separate Agent SDK process** with its own tool set and conversation context.

**Tools provided to each agent:**

| Tool | Purpose |
|---|---|
| `file_read` | Read files from the project |
| `file_write` | Write/edit files |
| `shell_exec` | Run shell commands (sf, git, npm, etc.) |
| `git_branch` | Create/switch branches (scoped to assigned branch) |
| `sf_deploy` | Deploy source to assigned scratch org |
| `sf_test` | Run Apex tests on assigned org |
| `request_input` | Signal the orchestrator that human input is needed |
| `report_complete` | Signal development is done, trigger provisioning |

**Agent sandboxing:**
- Each agent's `shell_exec` and `sf_deploy` tools are configured with its assigned scratch org alias — it **cannot** target a different org.
- Each agent's `git_branch` tool is scoped to its assigned feature branch.
- Tools enforce these constraints at the SDK level, not by trusting the agent's behavior.

### 4. xterm.js — Terminal Integration

Each agent spawns a PTY (pseudo-terminal) via `node-pty`. The PTY output streams to an `xterm.js` instance in the renderer.

```
Agent Process → node-pty → IPC stream → xterm.js (renderer)
```

This gives us:
- Real ANSI color support
- Full terminal emulation (scrollback, cursor positioning)
- Live command output as the agent works

### 5. SQLite — State Persistence

Lightweight embedded database. No server to manage.

**Tables:**

| Table | Purpose |
|---|---|
| `agents` | Agent ID, status, assigned ticket, assigned org, branch name |
| `tickets` | Ticket data pulled from Cognito, status, dependencies |
| `orgs` | Scratch org alias, status (available/leased/expired), assigned agent |
| `runs` | Run history — which tickets were processed, outcomes, timestamps |
| `prompts` | Refined prompts generated by the orchestrator (for debugging/replay) |

### 6. JSForce — Cognito Integration

JSForce connects to the Salesforce org where Cognito runs to pull ticket data.

```
JSForce → Cognito org → Query Cognito__Ticket__c records
                       → Read title, description, acceptance criteria, labels
                       → Read dependencies (Cognito__Ticket_Dependency__c)
                       → Write back status updates (In Progress, Done)
```

**Authentication:** OAuth2 / stored refresh token. Configured once during SweatShop setup.

### 7. Salesforce CLI — Org Provisioning

The provisioning script is a shell script (or Node wrapper) that calls `sf` commands:

```bash
# 1. Create scratch org
sf org create scratch -f config/project-scratch-def.json -a agent-1-org -d 7

# 2. Deploy from feature branch
sf project deploy start -o agent-1-org --source-dir force-app

# 3. Load test data
sf data import tree -o agent-1-org -p data/sample-data-plan.json

# 4. Assign permission sets
sf org assign permset -o agent-1-org -n Cognito_Admin

# 5. Generate login URL
sf org open -o agent-1-org --url-only
```

## Development Tooling

| Tool | Purpose |
|---|---|
| **TypeScript** | All code — main process, renderer, shared types |
| **Vite** | Renderer bundling (fast HMR for React development) |
| **electron-builder** | Packaging and distribution |
| **ESLint + Prettier** | Code style |
| **Vitest** | Unit tests |
| **Playwright** | E2E tests for the Electron app |

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    Electron App                              │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │              Renderer Process (React)                 │   │
│  │  ┌──────────┐ ┌────────────┐ ┌────────────────────┐  │   │
│  │  │ Chat     │ │ Terminal   │ │ BrowserView        │  │   │
│  │  │ (React)  │ │ (xterm.js) │ │ (Salesforce org)   │  │   │
│  │  └────┬─────┘ └─────┬──────┘ └──────────┬─────────┘  │   │
│  └───────┼─────────────┼───────────────────┼────────────┘   │
│          │    IPC       │    IPC            │ BrowserView API│
│  ┌───────┼─────────────┼───────────────────┼────────────┐   │
│  │       ▼             ▼                   ▼             │   │
│  │              Main Process (Node.js)                   │   │
│  │  ┌──────────────┐ ┌───────────┐ ┌──────────────┐    │   │
│  │  │ Orchestrator │ │ OrgPool   │ │ StateStore   │    │   │
│  │  └──────┬───────┘ └───────────┘ │ (SQLite)     │    │   │
│  │         │                        └──────────────┘    │   │
│  │         ▼                                             │   │
│  │  ┌──────────────────────────────────┐                │   │
│  │  │         Agent Manager            │                │   │
│  │  │  ┌─────────┐  ┌─────────┐       │                │   │
│  │  │  │ Agent 1 │  │ Agent 2 │  ...  │                │   │
│  │  │  │ (SDK)   │  │ (SDK)   │       │                │   │
│  │  │  └────┬────┘  └────┬────┘       │                │   │
│  │  └───────┼────────────┼────────────┘                │   │
│  └──────────┼────────────┼──────────────────────────────┘   │
└─────────────┼────────────┼──────────────────────────────────┘
              ▼            ▼
     ┌────────────┐ ┌────────────┐
     │ sf CLI     │ │ git CLI    │
     │ JSForce    │ │ node-pty   │
     └────────────┘ └────────────┘
```

## Key Dependencies

| Package | Version Strategy | Notes |
|---|---|---|
| `electron` | Latest stable | Core shell |
| `react` | 18+ | UI framework |
| `@anthropic-ai/claude-code` | Latest | Agent SDK |
| `xterm` | 5+ | Terminal emulation |
| `node-pty` | Latest | PTY for agent shells |
| `better-sqlite3` | Latest | Embedded database |
| `jsforce` | 3+ | Salesforce API client |
| `vite` | Latest | Build tooling |
| `electron-builder` | Latest | Packaging |

## Open Questions

1. **Agent SDK specifics** — Need to confirm Claude Agent SDK supports spawning multiple isolated agent instances with scoped tool definitions. If not, we may wrap the Claude API directly.
2. **BrowserView vs. webview tag** — Electron has been deprecating `<webview>`. Need to evaluate `BrowserView` vs. the newer `WebContentsView` API.
3. **Org pool pre-warming** — Should we pre-create scratch orgs on startup to reduce wait time when agents hit `PROVISIONING`?
4. **Multi-platform** — Windows-first (your environment), but Electron is cross-platform. Any Mac/Linux requirements?
