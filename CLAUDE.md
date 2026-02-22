# SweatShop — Development Notes

## Prerequisites

### Salesforce CLI
The app requires the [Salesforce CLI](https://developer.salesforce.com/tools/salesforcecli) (`sf`) to be installed and authenticated.

```bash
npm install -g @salesforce/cli
```

### SF CLI Plugins

| Plugin | Required For | Install Command |
|--------|-------------|-----------------|
| `@salesforce/plugin-lightning-dev` | LWC Preview in PR review screen | `sf plugins install @salesforce/plugin-lightning-dev` |

The **LWC Preview** feature (`sf lightning dev component`) requires a connected scratch org assigned to the agent. Without this plugin installed, the preview panel will fail with a "not a sf command" error.

## Architecture

- **Electron** main + renderer with React
- **IPC pattern**: channel (`ipc-channels.ts`) → handler (`ipc-handlers.ts`) → preload (`preload.ts`) → type (`types.ts`)
- **Two `SweatShopSettings` interfaces** exist: one in `src/shared/types.ts` (renderer-facing) and one in `src/main/services/settings.ts` (main process). Both must stay in sync.
- **Git worktrees** isolate agent work at `{projectDir}/.worktrees/{agentId}`
- **Agent state machine**: IDLE → ASSIGNED → BRANCHING → DEVELOPING → QA_READY → MERGING → IDLE
- **Claude Agent SDK** powers agent execution with MCP tools
- **Browser embedding** via Electron `WebContentsView` (not BrowserView, not iframe)

## Running

```bash
npm run dev    # Development mode with hot reload (renderer only)
npm run build  # Production build
npm start      # Build + launch
```
