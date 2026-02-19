# SweatShop — UI Specification

## Design Principles

1. **Browser-first** — The scratch org browser pane dominates the screen. QA is the human's primary job.
2. **Glanceable status** — A quick look at the tab bar tells you which agents need attention.
3. **No context-switching** — Chat, terminal, and browser for any agent are all in one view.
4. **Interrupt-driven** — The human doesn't poll agents. Agents signal when they need input.

## Layout

### Overall Structure

```
┌──────────────────────────────────────────────────────────────────────┐
│  SweatShop          [Agent 1] [Agent 2 ●] [Agent 3] [+]     [⚙]   │
├───────────────────┬──────────────────────────────────────────────────┤
│                   │                                                  │
│                   │                                                  │
│    Chat Pane      │                                                  │
│                   │              Browser Pane                        │
│  ┌─────────────┐  │           (scratch org UI)                       │
│  │ agent msgs  │  │                                                  │
│  │ user msgs   │  │                                                  │
│  │ ...         │  │                                                  │
│  ├─────────────┤  │                                                  │
│  │ [input]  [⏎]│  │                                                  │
│  └─────────────┘  │                                                  │
│                   │                                                  │
├───────────────────┤                                                  │
│                   │                                                  │
│  Terminal Pane    │                                                  │
│                   │                                                  │
│  $ sf deploy...   │                                                  │
│  Deploying...     │                                                  │
│  ✓ Complete       │                                                  │
│                   │                                                  │
└───────────────────┴──────────────────────────────────────────────────┘
```

### Proportions

| Pane | Width | Height |
|---|---|---|
| Browser | ~70% | 100% of content area |
| Chat | ~30% | ~55% of left sidebar |
| Terminal | ~30% | ~45% of left sidebar |

The left sidebar (Chat + Terminal) and the Browser pane should be resizable via a draggable divider.

## Agent Tab Bar

### Tab States

| State | Visual Treatment |
|---|---|
| `IDLE` | Muted / grayed out |
| `DEVELOPING` | Default text, subtle spinner |
| `PROVISIONING` | Default text, progress indicator |
| `QA_READY` | **Bold text, filled dot badge (●), pulse animation** |
| `REWORK` | Default text, spinner |
| `NEEDS_INPUT` | **Bold text, filled dot badge (●), distinct color** |
| Active tab | Highlighted background |

### Key Behavior
- `QA_READY` and `NEEDS_INPUT` are the two "interrupt" states — they must be visually unmissable.
- When a background agent enters an interrupt state, its tab badge appears and (optionally) a toast notification fires.
- Clicking a tab switches all three panes (chat, terminal, browser) to that agent's context.

### [+] Button
- Launches a new agent (if org capacity allows)
- Or shows a disabled state with tooltip: "No scratch orgs available"

## Chat Pane

- Scrollable message history
- Messages attributed to either `Agent` or `User`
- Input box at the bottom with send button
- Supports:
  - Free-text input (questions, feedback, approvals)
  - Quick-action buttons when agent is `QA_READY`: **[Approve]** **[Reject]**
- When agent is `QA_READY`, the chat pane should surface:
  - Summary of what was built
  - Link to relevant files changed
  - The approve/reject action buttons

## Terminal Pane

- Read-only scrolling output
- Mirrors what you'd see in a VS Code integrated terminal
- Auto-scrolls to bottom on new output
- Supports ANSI color codes for readability
- Filterable (optional) — show all output, errors only, or deployment output only

## Browser Pane

- Embedded browser (iframe or webview) pointed at the scratch org
- Loads automatically when the agent reaches `QA_READY`
- Login is handled by the provisioning script (frontdoor URL or session ID)
- Should support basic browser controls: back, forward, refresh, URL bar (read-only)
- Full-screen toggle to expand browser pane to 100% (hides sidebar temporarily)

## Orchestrator View (Future)

A separate view (not per-agent) showing:
- All tickets in the current batch
- Dependency graph
- Assignment status (which agent has which ticket)
- Overall progress

This is secondary to the per-agent views and can be a later iteration.

## Notifications

| Event | Notification |
|---|---|
| Agent reaches `QA_READY` | Tab badge + optional toast |
| Agent asks a question | Tab badge + optional toast |
| Agent errors / gets stuck | Tab badge (error color) + toast |
| All tickets complete | Full-screen summary |
| Org limit reached | Warning banner at top of dashboard |

## Accessibility & Ergonomics

- Keyboard shortcuts for switching between agent tabs (Ctrl+1, Ctrl+2, etc.)
- Keyboard shortcut to jump to next agent needing input (Ctrl+N or similar)
- Chat input focused by default when switching to an agent in interrupt state
