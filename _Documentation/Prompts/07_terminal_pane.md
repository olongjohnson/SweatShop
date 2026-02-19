# Prompt 07 — Terminal Pane (xterm.js + node-pty)

## Context

You are working on **SweatShop**, an Electron desktop app. Agents execute shell commands via their tools. The terminal pane needs to display live command output per agent, mirroring a real terminal.

## Task

Replace the placeholder TerminalPane with a real xterm.js terminal, fed by agent command output via IPC.

## Requirements

### 1. Install Dependencies

```
@xterm/xterm
@xterm/addon-fit
@xterm/addon-web-links
node-pty
```

**Note:** `node-pty` is a native module. If it fails to compile for Electron, try:
1. `npx electron-rebuild` to rebuild native modules
2. Or use `@xterm/addon-attach` with a WebSocket approach as fallback

If `node-pty` proves too difficult to set up, use `child_process.spawn` with piped stdout/stderr as a simpler alternative. The terminal won't have full PTY features but will still show live output.

### 2. Terminal Manager (`src/main/services/terminal-manager.ts`)

Manages one PTY (or process stream) per agent.

```ts
class TerminalManager {
  private terminals: Map<string, PTYInstance>;

  // Create a terminal for an agent
  create(agentId: string, options?: {
    cwd?: string;
    env?: Record<string, string>;
  }): void;

  // Write data to an agent's terminal (commands from the agent runtime)
  write(agentId: string, data: string): void;

  // Execute a command and stream output via IPC
  // Called by the agent's shell_exec tool
  async exec(agentId: string, command: string): Promise<{
    exitCode: number;
    stdout: string;
    stderr: string;
  }>;

  // Subscribe to terminal output (main process → renderer via IPC)
  onData(agentId: string, callback: (data: string) => void): void;

  // Kill a terminal
  destroy(agentId: string): void;
}
```

### 3. Terminal Data Flow

```
Agent calls shell_exec("sf project deploy start")
  → AgentInstance executes via TerminalManager.exec()
    → TerminalManager spawns child process
      → stdout/stderr streamed in real-time
        → IPC: main process sends 'agent:terminal-data' to renderer
          → xterm.js instance writes the data
    → Command completes → result returned to agent
```

**Important:** The agent's `shell_exec` tool should both:
1. Stream output in real-time (for the terminal pane)
2. Capture the full output (for the tool result back to Claude)

### 4. Terminal Pane Component (`src/renderer/components/TerminalPane.tsx`)

**Props:** `agentId: string`

**Implementation:**
- Create an xterm.js `Terminal` instance on mount
- Apply `FitAddon` to auto-size to the container
- Apply `WebLinksAddon` to make URLs clickable
- Subscribe to `agent:terminal-data` IPC events for this agentId
- Write incoming data to the terminal
- Re-fit on container resize (listen for ResizeObserver)

**Terminal theme:**
```ts
const terminalTheme = {
  background: '#0d0d0d',
  foreground: '#e0e0e0',
  cursor: '#e94560',
  cursorAccent: '#0d0d0d',
  selectionBackground: '#3a3a5a',
  black: '#1a1a2e',
  red: '#e94560',
  green: '#7ed321',
  yellow: '#f5a623',
  blue: '#4a90d9',
  magenta: '#9013fe',
  cyan: '#50e3c2',
  white: '#e0e0e0',
  brightBlack: '#606080',
  brightRed: '#ff6b81',
  brightGreen: '#a8e6cf',
  brightYellow: '#ffd93d',
  brightBlue: '#6eb5ff',
  brightMagenta: '#b388ff',
  brightCyan: '#84ffff',
  brightWhite: '#ffffff',
};
```

**Terminal options:**
- Font: `'Consolas', 'Courier New', monospace`
- Font size: 13
- Scrollback: 5000 lines
- Read-only: true (agents write commands, humans observe)

### 5. Cleanup

- When switching agents, dispose the old xterm instance and create a new one (or maintain a pool of terminals per agent)
- When an agent is destroyed, clean up its terminal and PTY
- Remove IPC listeners on unmount

### 6. Fallback Without node-pty

If node-pty can't be made to work, implement a simpler approach:
- Use `child_process.spawn` in the main process
- Pipe stdout and stderr to the renderer via IPC
- xterm.js still renders the output (it handles raw text + ANSI codes fine)
- You lose interactive terminal features (no Ctrl+C passthrough, no tab completion) but all command output still displays correctly

### 7. Wire Into Agent Runtime

Update the `shell_exec` tool in `agent-tools.ts` to:
1. Call `terminalManager.exec(agentId, command)` instead of bare `child_process.exec`
2. Stream output chunks via the terminal manager's data events
3. Return the full output as the tool result

## Acceptance Criteria

1. xterm.js renders in the terminal pane with the dark theme
2. When an agent runs a shell command, output appears in real-time
3. ANSI colors render correctly (green for success, red for errors, etc.)
4. Terminal auto-resizes when the pane or window is resized
5. Switching agent tabs switches the terminal output
6. Scrollback works (can scroll up to see previous output)
7. URLs in terminal output are clickable
