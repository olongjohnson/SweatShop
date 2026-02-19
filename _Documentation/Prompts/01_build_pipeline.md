# Prompt 01 — Build Pipeline (TypeScript + React + Vite + Electron)

## Context

You are working on **SweatShop**, an Electron desktop app (AI agent orchestrator for Salesforce development). The project currently has a working Electron hello world with plain JavaScript. We need to convert it to a proper TypeScript + React + Vite build pipeline.

**Project root:** The current working directory.

**Existing files you must preserve/adapt:**
- `main.js` → will become `src/main/main.ts`
- `preload.js` → will become `src/main/preload.ts`
- `index.html` → will become `src/renderer/index.html`
- `scripts/launch.js` — keep as-is (it unsets `ELECTRON_RUN_AS_NODE` before spawning Electron)
- `assets/icon.png` — keep as-is
- `package.json` — update in place

**Critical Electron gotcha on this machine:** VS Code's terminal sets `ELECTRON_RUN_AS_NODE=1` which breaks `require('electron')`. The `scripts/launch.js` file handles this — do NOT remove it.

## Task

Set up the full build pipeline with this directory structure:

```
SweatShop/
├── src/
│   ├── main/              # Electron main process
│   │   ├── main.ts        # App entry, window creation
│   │   └── preload.ts     # Context bridge
│   ├── renderer/          # React app (Vite-bundled)
│   │   ├── index.html     # HTML entry
│   │   ├── main.tsx       # React entry point
│   │   ├── App.tsx        # Root component
│   │   └── App.css        # Global styles
│   └── shared/            # Types shared between main & renderer
│       └── types.ts       # Shared interfaces
├── scripts/
│   └── launch.js          # Existing launcher (keep as-is)
├── assets/
│   └── icon.png           # Existing icon (keep as-is)
├── tsconfig.json          # TypeScript config (main + shared)
├── tsconfig.renderer.json # TypeScript config (renderer)
├── vite.config.ts         # Vite config for renderer
├── package.json           # Updated with all deps + scripts
└── .gitignore             # Node, Electron, build artifacts
```

## Requirements

### 1. Install Dependencies

**Production dependencies:**
- `react`, `react-dom`

**Dev dependencies:**
- `typescript`
- `vite`
- `@vitejs/plugin-react`
- `electron-builder` (for future packaging)
- `@types/react`, `@types/react-dom`
- `concurrently` (to run Vite + Electron together in dev)

Do NOT install `electron` — it's already in devDependencies.

### 2. TypeScript Configuration

**`tsconfig.json`** (main process + shared):
- Target: `ES2022`
- Module: `commonjs` (Electron main process is CJS)
- outDir: `dist/main`
- Include: `src/main/**/*`, `src/shared/**/*`
- Strict mode enabled

**`tsconfig.renderer.json`** (renderer — Vite handles bundling):
- Target: `ES2022`
- Module: `ESNext`
- jsx: `react-jsx`
- Include: `src/renderer/**/*`, `src/shared/**/*`
- noEmit: true (Vite bundles, not tsc)

### 3. Vite Configuration

- Root: `src/renderer`
- Build outDir: `../../dist/renderer`
- Base: `./` (for Electron file:// loading)
- React plugin enabled
- Dev server port: 5173

### 4. Main Process (`src/main/main.ts`)

Port the existing `main.js` to TypeScript:
- Keep `app.setPath('userData', ...)`
- Keep the icon path (adjust to `path.join(__dirname, '../../assets/icon.png')`)
- In development, load from Vite dev server (`http://localhost:5173`)
- In production, load from `dist/renderer/index.html`
- Use env var or `app.isPackaged` to detect mode

### 5. Preload (`src/main/preload.ts`)

- Use `contextBridge` to expose a typed API to the renderer
- For now, expose a minimal `sweatshop` API object:
  ```ts
  {
    platform: process.platform,
    versions: { chrome, node, electron }
  }
  ```

### 6. Renderer (`src/renderer/`)

- `index.html` with `<div id="root">` and `<script type="module" src="./main.tsx">`
- `main.tsx` renders `<App />` into the root div
- `App.tsx` displays the SweatShop title, tagline, and version info (reading from the preload bridge)
- `App.css` with the dark theme from the existing `index.html` (background `#1a1a2e`, text `#e0e0e0`, accent `#e94560`)

### 7. Shared Types (`src/shared/types.ts`)

Create a placeholder with:
```ts
export interface SweatShopAPI {
  platform: string;
  versions: {
    chrome: string;
    node: string;
    electron: string;
  };
}
```

### 8. Package.json Scripts

```json
{
  "start": "node scripts/launch.js",
  "dev": "concurrently \"vite --config vite.config.ts\" \"tsc -p tsconfig.json && node scripts/launch.js\"",
  "build": "tsc -p tsconfig.json && vite build --config vite.config.ts",
  "build:main": "tsc -p tsconfig.json",
  "build:renderer": "vite build --config vite.config.ts"
}
```

The `start` script should run the built app (build first if needed). The `dev` script runs Vite dev server + Electron concurrently.

### 9. .gitignore

```
node_modules/
dist/
.sweatshop/
*.js.map
```

## Acceptance Criteria

1. `npm run build` compiles without errors
2. `npm start` opens the Electron window showing the SweatShop title with dark theme
3. Version numbers (Chrome, Node, Electron) display correctly via the preload bridge
4. The SweatShop logo appears in the window title bar
5. No `ELECTRON_RUN_AS_NODE` errors
6. The old `main.js`, `preload.js`, and root `index.html` are removed (replaced by `src/` equivalents)
