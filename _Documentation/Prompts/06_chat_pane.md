# Prompt 06 — Chat Pane

## Context

You are working on **SweatShop**, an Electron desktop app. The agent runtime is in place and emits `chat-message` events via IPC. The app shell has a placeholder ChatPane component. Now wire it up for real.

## Task

Replace the placeholder ChatPane with a fully functional per-agent chat interface.

## Requirements

### 1. Chat Pane Component (`src/renderer/components/ChatPane.tsx`)

**Props:** `agentId: string`

**Layout:**
- Scrollable message area (top, fills available space)
- Action bar (middle, visible only in certain agent states)
- Input area (bottom, fixed)

### 2. Message Display

Each message has:
- **Role indicator:** Agent (bot icon or "A" avatar), User ("U" avatar), System (info icon)
- **Content:** Markdown-rendered text (use a lightweight markdown renderer like `react-markdown` or just handle bold/code/newlines manually)
- **Timestamp:** Relative time ("2m ago", "just now")

Styling:
- Agent messages: left-aligned, `--bg-secondary` background
- User messages: right-aligned, `--accent` background with white text
- System messages: centered, muted, italic (for status transitions like "Agent started developing")

Messages auto-scroll to bottom on new message. If the user has scrolled up, don't force-scroll (show a "New messages ↓" pill).

### 3. Action Bar

Visible above the input area when the agent is in specific states:

**QA_READY state:**
```
┌─────────────────────────────────────┐
│ ✅ Development complete — QA ready  │
│ [Approve]          [Reject]         │
└─────────────────────────────────────┘
```
- Approve button: green, calls `window.sweatshop.agents.approve(agentId)`
- Reject button: red outline, opens a text area for feedback, then calls `window.sweatshop.agents.reject(agentId, feedback)`

**NEEDS_INPUT state:**
```
┌─────────────────────────────────────┐
│ ⏳ Agent is waiting for your input  │
└─────────────────────────────────────┘
```
- Highlight the input area with `--accent` border
- Auto-focus the input

**ERROR state:**
```
┌─────────────────────────────────────┐
│ ❌ Agent encountered an error       │
│ [Retry]            [Stop Agent]     │
└─────────────────────────────────────┘
```

### 4. Input Area

- Text input (expandable textarea, not single-line)
- Send button (or Enter to send, Shift+Enter for newline)
- Disabled when agent is IDLE (no active conversation)
- Placeholder text changes based on state:
  - DEVELOPING: "Send a message to the agent..."
  - NEEDS_INPUT: "The agent is waiting for your response..."
  - QA_READY: "Add a note or use the buttons above..."

### 5. Message Loading

- On component mount (or agent tab switch), load history from `window.sweatshop.chat.history(agentId)`
- Subscribe to new messages via `window.sweatshop.chat.onMessage(callback)`
- Filter incoming messages to only show those for the current `agentId`

### 6. Real-Time Updates via IPC

Set up IPC listeners in the renderer:
- `chat:on-message` — new chat message from the agent
- `agent:status-changed` — agent status transition (update action bar)

Clean up listeners when the component unmounts or the agent changes.

### 7. Install Dependencies

```
react-markdown (optional — only if you want full markdown rendering)
```

If markdown rendering is complex, just handle: **bold**, `code`, code blocks, newlines, and bullet lists manually.

## Acceptance Criteria

1. Chat pane shows message history for the selected agent
2. Messages are visually distinct by role (agent, user, system)
3. Sending a message calls IPC and appears immediately in the chat
4. Action bar shows Approve/Reject when agent is QA_READY
5. Action bar shows "waiting for input" when agent is NEEDS_INPUT
6. Auto-scroll works, with "new messages" pill when scrolled up
7. Input is disabled when agent is IDLE
8. Switching agent tabs loads the correct chat history
