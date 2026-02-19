# SweatShop — Prompt Execution Order

Execute these prompts sequentially in Claude Code (Opus 4.6). Each prompt builds on the previous. Check off each as completed.

## Prerequisites
- Node.js installed
- Electron hello world already working (`npm start` launches the app)
- Git repo initialized and pushed to GitHub

## Execution Checklist

- [ ] **01 — Build Pipeline** (`01_build_pipeline.md`)
  Convert the project from plain JS to TypeScript + React + Vite for the renderer, with proper Electron main/renderer/preload separation.

- [ ] **02 — App Shell & Layout** (`02_app_shell.md`)
  Build the main window layout: top nav/tab bar, resizable left sidebar (chat + terminal), main content area (browser pane). Dark theme. No functionality yet — just the skeleton.

- [ ] **03 — Data Layer** (`03_data_layer.md`)
  SQLite database, shared TypeScript types, Electron IPC bridge between main and renderer. This is the backbone everything talks through.

- [ ] **04 — Story Management** (`04_story_management.md`)
  Manual story/ticket CRUD in SweatShop + Deathmark (Salesforce PM tool) integration for importing stories. This is the input pipeline.

- [ ] **05 — Agent Runtime** (`05_agent_runtime.md`)
  Claude API integration, agent process spawning, tool definitions, sandboxed execution. The core engine.

- [ ] **06 — Chat Pane** (`06_chat_pane.md`)
  Per-agent chat UI with message history, user input, quick actions (approve/reject). Wired to agent runtime via IPC.

- [ ] **07 — Terminal Pane** (`07_terminal_pane.md`)
  Per-agent xterm.js terminal with node-pty. Live command output streaming from agent processes.

- [ ] **08 — Orchestrator** (`08_orchestrator.md`)
  Prompt refinement engine, dependency analysis, agent dispatch, work queue management.

- [ ] **09 — Browser Pane** (`09_browser_pane.md`)
  Embedded Electron webview/WebContentsView for loading Salesforce scratch orgs. Navigation controls, auto-login via frontdoor URL.

- [ ] **10 — Git Integration** (`10_git_integration.md`)
  Per-agent feature branch management. Create, commit, merge, conflict detection.

- [ ] **11 — Org Controller & Provisioning** (`11_org_controller.md`)
  Scratch org pool management, agent-to-org access control, automated provisioning script (deploy, data, users, permsets).

- [ ] **12 — Agent Lifecycle & Notifications** (`12_agent_lifecycle.md`)
  Full state machine (IDLE → ASSIGNED → DEVELOPING → QA_READY → etc.), tab badges, toast notifications, keyboard shortcuts.

- [ ] **13 — Analytics & Metrics** (`13_analytics.md`)
  Per-ticket and per-agent metrics tracking: human interventions, timing, cost, autonomy scoring, analytics dashboard view.

## Notes
- Each prompt references the existing project structure and prior work
- Prompts include acceptance criteria the agent can self-verify
- If a prompt fails, fix the issue before moving to the next one
- The human should `npm start` and visually verify after each UI-related prompt
