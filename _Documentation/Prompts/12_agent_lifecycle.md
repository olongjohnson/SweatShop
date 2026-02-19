# Prompt 12 — Agent Lifecycle & Notifications

## Context

You are working on **SweatShop**, an Electron desktop app. All individual components (agents, chat, terminal, browser, git, orgs) are built. Now we need to tie them together with the full agent lifecycle state machine and notification system.

## Task

Implement the complete agent state machine, connect all the transitions, and build the notification system.

## Requirements

### 1. State Machine (`src/main/services/agent-state-machine.ts`)

Formalize the agent state transitions:

```ts
const VALID_TRANSITIONS: Record<AgentStatus, AgentStatus[]> = {
  IDLE:         ['ASSIGNED'],
  ASSIGNED:     ['BRANCHING', 'ERROR'],
  BRANCHING:    ['DEVELOPING', 'ERROR'],
  DEVELOPING:   ['NEEDS_INPUT', 'PROVISIONING', 'ERROR'],
  NEEDS_INPUT:  ['DEVELOPING'],
  PROVISIONING: ['QA_READY', 'ERROR'],
  QA_READY:     ['MERGING', 'REWORK'],
  MERGING:      ['IDLE', 'ERROR'],
  REWORK:       ['DEVELOPING', 'ERROR'],
  ERROR:        ['IDLE', 'DEVELOPING', 'PROVISIONING'], // retry paths
};

function transition(current: AgentStatus, next: AgentStatus): boolean {
  return VALID_TRANSITIONS[current]?.includes(next) ?? false;
}
```

### 2. Full Lifecycle Integration

Wire the state machine through every component:

**IDLE → ASSIGNED:**
- Orchestrator dispatches ticket to agent
- DB updated: agent.assignedTicketId, agent.status
- UI: tab shows assigned state

**ASSIGNED → BRANCHING:**
- GitService creates worktree + feature branch
- Terminal shows branch creation output
- Chat: system message "Creating branch feature/..."

**BRANCHING → DEVELOPING:**
- Branch ready, agent loop starts
- Claude receives the refined prompt
- Terminal shows agent's commands in real-time
- Chat shows agent's conversational output

**DEVELOPING → NEEDS_INPUT:**
- Agent calls `request_human_input` tool
- **NOTIFICATION FIRES** (this is an interrupt state)
- Chat shows the agent's question
- Input area highlighted
- Intervention event recorded

**NEEDS_INPUT → DEVELOPING:**
- Human sends a message
- Agent resumes its loop
- Intervention event completed (waitDurationMs recorded)

**DEVELOPING → PROVISIONING:**
- Agent calls `report_development_complete`
- ProvisioningService takes over
- Terminal shows deploy progress
- Chat: system message "Deploying to scratch org..."

**PROVISIONING → QA_READY:**
- Provisioning complete, login URL generated
- **NOTIFICATION FIRES** (this is an interrupt state)
- Browser pane loads the scratch org URL
- Chat shows: work summary + approve/reject buttons
- Tab shows ● badge

**QA_READY → MERGING:**
- Human clicks Approve
- GitService merges feature branch to base
- Terminal shows merge output
- Chat: system message "Merging to main..."

**QA_READY → REWORK:**
- Human clicks Reject and provides feedback
- Agent receives feedback, resumes development
- reworkCount incremented
- Intervention event recorded
- State returns to DEVELOPING

**MERGING → IDLE:**
- Merge successful
- Org released back to pool
- Worktree removed
- Ticket status → 'merged'
- Chat: system message "Work complete! Branch merged."
- Agent ready for next ticket

**Any → ERROR:**
- Capture error details
- Chat: system message with error
- **NOTIFICATION FIRES**
- Tab shows error indicator
- Recovery options shown in action bar

### 3. Notification System (`src/renderer/components/NotificationSystem.tsx`)

**Toast notifications:**
```ts
interface Toast {
  id: string;
  type: 'info' | 'success' | 'warning' | 'error';
  title: string;
  body: string;
  agentId?: string;      // Click to switch to this agent
  autoDismissMs: number; // 0 = manual dismiss
}
```

**When to fire toasts:**

| Event | Toast | Auto-dismiss |
|---|---|---|
| Agent reaches QA_READY | "Agent 1 is ready for QA review" (success) | No — requires action |
| Agent needs input | "Agent 2 has a question" (warning) | No — requires action |
| Agent hits error | "Agent 3 encountered an error" (error) | No |
| Ticket merged | "TICKET-001 merged successfully" (success) | 5 seconds |
| All tickets complete | "All work complete!" (success) | No |
| Org pool exhausted | "No scratch orgs available" (warning) | No |

**Toast positioning:** Bottom-right corner, stacked vertically, newest on top.

**Click behavior:** Clicking a toast switches to the relevant agent tab.

### 4. Tab Bar Badges (Update `AgentTabBar.tsx`)

Replace mock data with real agent state from IPC:

```ts
// Subscribe to agent status changes
useEffect(() => {
  const unsub = window.sweatshop.agents.onStatusChanged((agentId, status) => {
    updateAgentStatus(agentId, status);
  });
  return unsub;
}, []);
```

**Badge rules:**
- `QA_READY`: pulsing green ● badge
- `NEEDS_INPUT`: pulsing amber ● badge
- `ERROR`: red ● badge
- `DEVELOPING` / `PROVISIONING` / `REWORK`: subtle animated spinner
- `IDLE`: no badge, muted text
- Active tab: highlighted regardless of state

### 5. Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl+1` through `Ctrl+9` | Switch to agent tab 1-9 |
| `Ctrl+N` | Jump to next agent needing input (QA_READY or NEEDS_INPUT) |
| `Ctrl+Shift+N` | Jump to next agent with any notification |
| `Ctrl+Enter` | Send message in chat (when chat input focused) |
| `Ctrl+Shift+A` | Approve current agent's work (when QA_READY) |
| `F11` | Toggle browser pane full-screen |

Register shortcuts via Electron's `globalShortcut` or renderer-side keyboard event listeners.

### 6. All Tickets Complete Summary

When the orchestrator finishes all tickets, show a summary overlay:

```
┌──────────────────────────────────────────┐
│        All Work Complete! 🎉             │
│                                          │
│  Tickets processed: 5                    │
│  Total time: 2h 14m                      │
│  Human interventions: 7                  │
│  Rework cycles: 2                        │
│  Agents used: 3                          │
│                                          │
│  [View Analytics]        [Close]         │
└──────────────────────────────────────────┘
```

## Acceptance Criteria

1. State machine enforces valid transitions (invalid transitions throw)
2. Every state transition triggers the correct downstream actions
3. Toast notifications fire for interrupt states (QA_READY, NEEDS_INPUT, ERROR)
4. Tab badges update in real-time based on agent status
5. Clicking a toast switches to the relevant agent
6. Keyboard shortcuts work for tab switching and quick actions
7. Full lifecycle works end-to-end: ticket assigned → developing → QA → merge → idle
8. Rework loop works: reject → feedback → rework → QA again
9. Error recovery paths work
10. All-tickets-complete summary appears when orchestrator finishes
