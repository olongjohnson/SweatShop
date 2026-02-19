# Prompt 09 — Browser Pane (Electron WebContentsView)

## Context

You are working on **SweatShop**, an Electron desktop app. The main content area currently shows a placeholder. It needs to be an embedded browser for loading Salesforce scratch orgs during QA review.

## Task

Implement the browser pane using Electron's `WebContentsView` (preferred) or `<webview>` tag. The browser loads scratch org login URLs and lets the human QA the agent's work.

## Requirements

### 1. Evaluate API Choice

Electron has been deprecating `<webview>` in favor of `WebContentsView` (successor to `BrowserView`). Check the installed Electron version's docs:
- If `WebContentsView` is available (Electron 29+): use it
- If not: use `<webview>` with `webviewTag: true` in webPreferences
- Document which approach was used and why

### 2. Browser Manager (`src/main/services/browser-manager.ts`)

Manages one browser view per agent.

```ts
class BrowserManager {
  private views: Map<string, WebContentsView>;
  private mainWindow: BrowserWindow;

  constructor(mainWindow: BrowserWindow);

  // Create a browser view for an agent
  create(agentId: string): void;

  // Load a URL (typically a scratch org frontdoor URL)
  loadURL(agentId: string, url: string): void;

  // Show a specific agent's browser (hide others)
  show(agentId: string, bounds: { x: number; y: number; width: number; height: number }): void;

  // Hide all browser views
  hideAll(): void;

  // Navigate: back, forward, refresh
  goBack(agentId: string): void;
  goForward(agentId: string): void;
  reload(agentId: string): void;

  // Get current URL
  getURL(agentId: string): string;

  // Destroy a browser view
  destroy(agentId: string): void;
}
```

### 3. Browser Pane Component (`src/renderer/components/BrowserPane.tsx`)

**Props:** `agentId: string`

**Layout:**
```
┌──────────────────────────────────────────────┐
│  [←] [→] [↻]  https://org.salesforce.com/.. │
├──────────────────────────────────────────────┤
│                                              │
│           (WebContentsView renders here)     │
│                                              │
│                                              │
│                                              │
│                                              │
│                                              │
│                                              │
└──────────────────────────────────────────────┘
```

**Navigation bar:**
- Back button: calls `window.sweatshop.browser.back(agentId)`
- Forward button: calls `window.sweatshop.browser.forward(agentId)`
- Reload button: calls `window.sweatshop.browser.reload(agentId)`
- URL display: read-only, shows current URL
- Full-screen toggle button: expands browser to fill entire content area (hides sidebar)

**States:**
- No URL loaded: show placeholder with SweatShop logo and "Waiting for agent to reach QA_READY..."
- Loading: show a thin progress bar at top of the browser area
- Loaded: show the Salesforce org
- Error: show error message with retry button

### 4. Auto-Load on QA_READY

When an agent transitions to `QA_READY`:
1. The provisioning step produces a login URL (frontdoor URL)
2. The browser manager loads this URL into the agent's browser view
3. If the user is viewing a different agent, the browser pre-loads in the background
4. When the user switches to the QA_READY agent, the browser view is already loaded

### 5. Bounds Management

`WebContentsView` is positioned in pixel coordinates relative to the main window. The renderer needs to communicate the browser pane's position and size to the main process.

```ts
// Renderer sends bounds whenever the layout changes
window.sweatshop.browser.setBounds(agentId, {
  x: sidebarWidth,
  y: titleBarHeight + navBarHeight,
  width: windowWidth - sidebarWidth,
  height: windowHeight - titleBarHeight - navBarHeight
});
```

Use a ResizeObserver on the browser pane container to detect size changes and update bounds.

### 6. Session Isolation

Each agent's browser view should have a separate session/partition so scratch org sessions don't interfere with each other:

```ts
const view = new WebContentsView({
  webPreferences: {
    partition: `persist:agent-${agentId}`,
  }
});
```

### 7. IPC Additions

```ts
browser: {
  loadURL: (agentId, url) => ipcRenderer.invoke('browser:load-url', agentId, url),
  setBounds: (agentId, bounds) => ipcRenderer.invoke('browser:set-bounds', agentId, bounds),
  back: (agentId) => ipcRenderer.invoke('browser:back', agentId),
  forward: (agentId) => ipcRenderer.invoke('browser:forward', agentId),
  reload: (agentId) => ipcRenderer.invoke('browser:reload', agentId),
  getURL: (agentId) => ipcRenderer.invoke('browser:get-url', agentId),
  show: (agentId) => ipcRenderer.invoke('browser:show', agentId),
  hideAll: () => ipcRenderer.invoke('browser:hide-all'),
}
```

### 8. Security

- Do NOT enable `nodeIntegration` in the browser view
- Set a restrictive CSP for the browser view
- Only allow navigation to Salesforce domains (*.salesforce.com, *.force.com, *.lightning.force.com)
- Block navigation to other domains (prevent agents from injecting malicious URLs)

## Acceptance Criteria

1. Browser pane renders in the main content area
2. Navigation bar with back/forward/reload/URL display works
3. Loading a Salesforce frontdoor URL displays the scratch org
4. Each agent has an isolated browser session (separate cookies/auth)
5. Switching agent tabs switches the browser view
6. Browser view resizes correctly when the window or sidebar is resized
7. Full-screen toggle expands/collapses the browser pane
8. Placeholder shown when no URL is loaded
9. Only Salesforce domains can be loaded (security)
