# Prompt 02 — App Shell & Layout

## Context

You are working on **SweatShop**, an Electron desktop app. The build pipeline (TypeScript + React + Vite) is already set up. The renderer runs at `src/renderer/`.

## Task

Build the main application layout shell. This is structural — no backend logic, no real data. Use hardcoded mock data to prove the layout works.

## Layout Specification

```
┌──────────────────────────────────────────────────────────────────────┐
│  🔵 SweatShop    [Agent 1] [Agent 2 ●] [Agent 3]  [+]   [📋] [⚙]  │
├───────────────────┬──────────────────────────────────────────────────┤
│                   │                                                  │
│    Chat Pane      │                                                  │
│    ~55% height    │           Main Content Area                      │
│                   │           (Browser pane later,                   │
│  ┌─────────────┐  │            placeholder for now)                  │
│  │ messages    │  │                                                  │
│  │ ...         │  │           ~70% width                             │
│  ├─────────────┤  │                                                  │
│  │ [input] [⏎] │  │                                                  │
│  └─────────────┘  │                                                  │
│                   │                                                  │
├───────────────────┤                                                  │
│                   │                                                  │
│  Terminal Pane    │                                                  │
│  ~45% height      │                                                  │
│                   │                                                  │
│  (placeholder)    │                                                  │
│                   │                                                  │
└───────────────────┴──────────────────────────────────────────────────┘
```

## Requirements

### 1. Component Structure

```
src/renderer/
├── App.tsx                    # Layout root
├── App.css                    # Global styles + CSS variables
├── components/
│   ├── TitleBar.tsx           # Top bar: logo, agent tabs, action buttons
│   ├── AgentTabBar.tsx        # Tab strip within title bar
│   ├── Sidebar.tsx            # Left sidebar container
│   ├── ChatPane.tsx           # Chat messages + input (placeholder)
│   ├── TerminalPane.tsx       # Terminal output (placeholder)
│   ├── MainContent.tsx        # Right-side main area (browser pane later)
│   └── ResizableDivider.tsx   # Draggable divider between sidebar & main
```

### 2. Design System (CSS Variables)

Define in `App.css`:
```css
:root {
  --bg-primary: #1a1a2e;       /* Main background */
  --bg-secondary: #16213e;     /* Sidebar, panels */
  --bg-tertiary: #0f3460;      /* Active states, highlights */
  --bg-input: #1a1a2e;         /* Input fields */
  --text-primary: #e0e0e0;     /* Main text */
  --text-secondary: #a0a0b0;   /* Muted text */
  --text-muted: #606080;       /* Very muted */
  --accent: #e94560;           /* Primary accent (SweatShop red) */
  --accent-hover: #ff6b81;     /* Accent hover */
  --success: #7ed321;          /* Approved, success states */
  --warning: #f5a623;          /* Developing, in-progress */
  --error: #d0021b;            /* Error states */
  --border: #2a2a4a;           /* Panel borders */
  --divider: #3a3a5a;          /* Resizable divider */
  --tab-active: #e94560;       /* Active agent tab */
  --tab-badge: #f5a623;        /* Needs-input badge */
  --radius: 6px;               /* Border radius */
  --sidebar-width: 30%;        /* Default sidebar width */
}
```

All components use these variables. No hardcoded colors anywhere else. No SLDS.

### 3. TitleBar Component

- Custom title bar area (not Electron's native frame — we'll use `frame: false` later, but for now just a styled div at the top)
- Left: SweatShop logo (icon.png, 24x24) + "SweatShop" text
- Center: Agent tab bar (delegated to `AgentTabBar`)
- Right: Stories button (📋 or list icon), Settings gear icon
- Height: ~40px
- Background: `--bg-secondary`

### 4. AgentTabBar Component

- Horizontal list of agent tabs
- Each tab shows: agent name + status indicator
- Mock data: 3 tabs — "Agent 1" (developing), "Agent 2" (needs input, with ● badge), "Agent 3" (idle)
- [+] button at the end to add new agent
- Clicking a tab sets it as active (local React state for now)
- Active tab has `--tab-active` bottom border

### 5. Sidebar Component

- Left panel, default 30% width
- Contains ChatPane (top, ~55%) and TerminalPane (bottom, ~45%)
- Vertically resizable divider between chat and terminal
- Background: `--bg-secondary`

### 6. ChatPane Component (Placeholder)

- Scrollable message area with mock messages:
  - Agent: "Starting work on TICKET-001: Implement login page"
  - Agent: "Created branch feature/TICKET-001-login-page"
  - Agent: "I have a question about the authentication method. Should I use OAuth2 or SAML?"
  - User: "Use OAuth2"
  - Agent: "Development complete. Ready for QA review."
- Input area at the bottom with text input + send button
- When agent status is QA_READY, show [Approve] and [Reject] buttons above the input

### 7. TerminalPane Component (Placeholder)

- Dark background (`#0d0d0d` or similar terminal black)
- Monospace font (Consolas, 'Courier New', monospace)
- Mock output lines with ANSI-like coloring:
  ```
  $ git checkout -b feature/TICKET-001-login-page
  Switched to a new branch 'feature/TICKET-001-login-page'
  $ sf project deploy start -o agent-1-org
  Deploying... ████████████░░░░ 75%
  ✓ Deploy complete (42 components)
  ```
- Auto-scrolled to bottom

### 8. MainContent Component (Placeholder)

- Takes remaining ~70% width
- For now, display a centered placeholder:
  - SweatShop logo (larger, ~80px)
  - "Browser pane will load here"
  - "Scratch org URL will appear when agent reaches QA_READY"
- Background: `--bg-primary`

### 9. ResizableDivider Component

- Vertical draggable divider between sidebar and main content
- `cursor: col-resize` on hover
- 4px wide, `--divider` color, lighter on hover
- Drag updates `--sidebar-width` (CSS variable or state)
- Min sidebar width: 250px, max: 50% of window

### 10. Responsive Behavior

- On window resize, layout stays proportional
- All panes use flexbox
- No scrollbars on the outer layout — only inside individual panes

## Acceptance Criteria

1. `npm run build && npm start` shows the full layout
2. Three mock agent tabs visible, clickable, one shows ● badge
3. Chat pane shows mock messages with different styling for agent vs user
4. Terminal pane shows mock output with monospace font
5. Main content shows placeholder with logo
6. Sidebar is resizable via dragging the divider
7. Dark theme looks cohesive — no white flashes, no unstyled elements
8. Window title bar shows SweatShop icon
