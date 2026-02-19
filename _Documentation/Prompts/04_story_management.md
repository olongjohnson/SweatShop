# Prompt 04 — Story Management (Manual CRUD + Deathmark Integration)

## Context

You are working on **SweatShop**, an Electron desktop app. The data layer (SQLite + IPC) is in place. We now need the UI and logic for creating/managing stories (tickets). There are two input methods:

1. **Manual** — User creates stories directly in SweatShop
2. **Deathmark** — Import stories from our Salesforce-native project management tool

## Task

Build the story management view and Deathmark integration.

## Requirements

### 1. Stories View (`src/renderer/views/StoriesView.tsx`)

A new view accessible from the 📋 button in the title bar. When clicked, the main content area switches from the agent dashboard to the stories view.

**Layout:**
```
┌─────────────────────────────────────────────────────┐
│ Stories                    [+ New Story] [↻ Sync]   │
├─────────────────────────────────────────────────────┤
│ Filter: [All ▾] [backlog ▾] [ready ▾]  🔍 search   │
├─────────────────────────────────────────────────────┤
│ ┌─────────────────────────────────────────────────┐ │
│ │ ● TICKET-001  Login Page Implementation    HIGH │ │
│ │   OAuth2 login flow for...      [Deathmark] 🏷  │ │
│ ├─────────────────────────────────────────────────┤ │
│ │ ○ TICKET-002  Dashboard Charts           MEDIUM │ │
│ │   Build analytics dashboard...   [Manual]  🏷   │ │
│ ├─────────────────────────────────────────────────┤ │
│ │ ...                                             │ │
│ └─────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────┘
```

**Features:**
- List all tickets, sorted by priority then creation date
- Filter by status, source (manual/deathmark), search by title
- Each row shows: status dot (color-coded), title, priority badge, source badge, labels
- Click a row to open the story detail/edit panel
- [+ New Story] opens the create form
- [↻ Sync] triggers Deathmark import

### 2. Story Create/Edit Form (`src/renderer/components/StoryForm.tsx`)

Slide-in panel or modal with fields:
- **Title** (required, text input)
- **Description** (required, textarea, supports markdown)
- **Acceptance Criteria** (textarea, supports markdown)
- **Priority** (dropdown: low, medium, high, critical)
- **Labels** (tag input — type and press enter to add, click X to remove)
- **Dependencies** (multi-select of other tickets by title)
- **Status** (dropdown, defaults to "backlog")

For Deathmark-sourced tickets, show a "Synced from Deathmark" badge and the external ID. Fields are editable (local overrides are fine).

**AI Assist button:** Next to the Description and Acceptance Criteria fields, add a ✨ button that:
- Takes the title + any existing description as input
- Calls the Claude API to expand it into a detailed story with acceptance criteria
- User can accept, edit, or discard the AI-generated content
- This gives us quick-and-dirty story generation directly in SweatShop

### 3. AI Story Generation (`src/main/services/story-generator.ts`)

A service in the main process that calls the Claude API:

```ts
async function generateStoryDetails(input: {
  title: string;
  description?: string;
  projectContext?: string; // We'll add project-specific context later
}): Promise<{
  description: string;
  acceptanceCriteria: string;
  suggestedLabels: string[];
}>
```

- Uses the Anthropic SDK (`@anthropic-ai/sdk`)
- System prompt tells Claude it's a Salesforce development story writer
- Returns structured output (description, acceptance criteria, suggested labels)
- Handle errors gracefully — show error in UI, don't crash

**Install dependency:** `@anthropic-ai/sdk`

**API key:** Read from environment variable `ANTHROPIC_API_KEY` or from a settings file at `~/.sweatshop/settings.json`. If not configured, the ✨ button should show a tooltip saying "Configure API key in settings".

### 4. Deathmark Integration (`src/main/services/deathmark.ts`)

Deathmark is a Salesforce-native project management tool. We connect via JSForce.

**Install dependency:** `jsforce`

**Service methods:**

```ts
interface DeathmarkConfig {
  instanceUrl: string;      // e.g., https://myorg.salesforce.com
  accessToken?: string;     // Direct token (for dev)
  refreshToken?: string;    // OAuth refresh token (for production)
  clientId?: string;
  clientSecret?: string;
}

class DeathmarkService {
  // Connect to the Salesforce org where Deathmark is installed
  async connect(config: DeathmarkConfig): Promise<void>;

  // Pull tickets from Deathmark
  // Query the relevant objects — we don't know the exact schema yet,
  // so use a configurable object/field mapping
  async fetchTickets(options?: {
    status?: string;
    sprint?: string;
    limit?: number;
  }): Promise<Ticket[]>;

  // Push status updates back to Deathmark
  async updateTicketStatus(externalId: string, status: string): Promise<void>;

  // Test the connection
  async testConnection(): Promise<{ success: boolean; error?: string }>;
}
```

**Field mapping config** (stored in `~/.sweatshop/settings.json`):
```json
{
  "deathmark": {
    "instanceUrl": "https://myorg.salesforce.com",
    "objectName": "Ticket__c",
    "fieldMapping": {
      "title": "Name",
      "description": "Description__c",
      "acceptanceCriteria": "Acceptance_Criteria__c",
      "priority": "Priority__c",
      "status": "Status__c",
      "labels": "Labels__c"
    }
  }
}
```

This makes it adaptable — we don't hardcode the Deathmark schema since it may evolve.

### 5. Settings Service (`src/main/services/settings.ts`)

Simple JSON file at `~/.sweatshop/settings.json`:

```ts
interface SweatShopSettings {
  anthropicApiKey?: string;
  deathmark?: DeathmarkConfig & { fieldMapping: Record<string, string> };
  git?: {
    baseBranch: string;       // Default: 'main'
    mergeStrategy: 'squash' | 'merge';
  };
  orgPool?: {
    maxOrgs: number;          // Default: 4
    scratchDefPath: string;   // Default: 'config/project-scratch-def.json'
    defaultDurationDays: number; // Default: 7
  };
}
```

- Load on app start
- Save on change
- Expose via IPC so the renderer can read/write settings

### 6. Navigation State

Add a simple navigation system so the title bar can toggle between:
- **Dashboard** (agent tabs, chat, terminal, browser) — default view
- **Stories** (story list, create/edit)

Use React state or context. No router needed — just a view switcher.

### 7. IPC Additions

Add to the preload bridge:
```ts
stories: {
  generate: (input) => ipcRenderer.invoke('story:generate', input),
},
deathmark: {
  testConnection: () => ipcRenderer.invoke('deathmark:test-connection'),
  sync: () => ipcRenderer.invoke('deathmark:sync'),
},
settings: {
  get: () => ipcRenderer.invoke('settings:get'),
  update: (data) => ipcRenderer.invoke('settings:update', data),
},
```

## Acceptance Criteria

1. User can create a story manually with all fields
2. Story list displays with filtering and search
3. ✨ AI assist button generates story details from a title (when API key is configured)
4. Settings are persisted in `~/.sweatshop/settings.json`
5. Deathmark service structure is in place (actual Salesforce connection tested separately)
6. Navigation toggles between Dashboard and Stories views
7. Stories persist across app restarts (SQLite)
