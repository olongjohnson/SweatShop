# Prompt 11 — Org Access Controller & Provisioning

## Context

You are working on **SweatShop**, an Electron desktop app. Agents need scratch orgs to deploy to and for human QA. The org controller manages the pool, enforces access rules, and automates provisioning.

## Task

Build the scratch org pool manager, access controller, and provisioning automation.

## Requirements

### 1. Org Pool Service (`src/main/services/org-pool.ts`)

```ts
class OrgPoolService {
  private db: DatabaseService;

  // Register a scratch org in the pool (manually or auto-discovered)
  async registerOrg(alias: string, options?: {
    expiresAt?: string;
    loginUrl?: string;
  }): Promise<ScratchOrg>;

  // Claim an org for an agent (lease it)
  async claimOrg(agentId: string): Promise<ScratchOrg | null>;
  // Returns null if no orgs available
  // Sets org status to 'leased', records assignedAgentId

  // Release an org back to the pool
  async releaseOrg(orgId: string): Promise<void>;
  // Sets status back to 'available', clears assignedAgentId

  // Get pool status
  async getStatus(): Promise<{
    total: number;
    available: number;
    leased: number;
    expired: number;
  }>;

  // List all orgs with their assignments
  async listOrgs(): Promise<ScratchOrg[]>;

  // Check for expired orgs and update their status
  async refreshOrgStatus(): Promise<void>;

  // Remove an org from the pool
  async removeOrg(orgId: string): Promise<void>;

  // Auto-discover existing scratch orgs via sf CLI
  async discoverOrgs(): Promise<ScratchOrg[]>;
}
```

### 2. Access Control Rules

Enforced at the service level — no exceptions:

1. **1:1 mapping** — An org can only be leased to ONE agent at a time
2. **Explicit claim** — An agent MUST call `claimOrg` before any deploy
3. **No cross-access** — Agent tools validate that the target org matches the leased org
4. **Capacity limit** — Pool respects `settings.orgPool.maxOrgs` (default: 4)
5. **Auto-release** — When an agent completes or is stopped, its org is released
6. **Expiry tracking** — Scratch orgs expire (default 7 days). Pool checks and marks expired orgs.

### 3. Org Discovery (`sf org list`)

Auto-detect existing scratch orgs:

```ts
async discoverOrgs(): Promise<ScratchOrg[]> {
  // Run: sf org list --json
  // Parse the JSON output
  // For each scratch org found:
  //   - Check if already registered in DB
  //   - If not, register it as 'available'
  //   - If yes, update its status/expiry
  // Return the full list
}
```

### 4. Provisioning Service (`src/main/services/provisioning.ts`)

Runs when an agent transitions to `PROVISIONING` state. Deploys the agent's code to a scratch org and sets up QA environment.

```ts
class ProvisioningService {
  // Full provisioning pipeline
  async provision(config: {
    agentId: string;
    orgAlias: string;
    branchName: string;
    worktreePath: string; // Agent's git worktree directory
  }): Promise<{
    success: boolean;
    loginUrl?: string;
    errors?: string[];
  }>;

  // Individual steps (called by provision)
  private async createOrg(alias: string, scratchDefPath: string, durationDays: number): Promise<boolean>;
  private async deploySource(orgAlias: string, sourcePath: string): Promise<boolean>;
  private async loadTestData(orgAlias: string, dataPlanPath: string): Promise<boolean>;
  private async createUsers(orgAlias: string): Promise<boolean>;
  private async assignPermissionSets(orgAlias: string, permsets: string[]): Promise<boolean>;
  private async getLoginUrl(orgAlias: string): Promise<string>;
}
```

### 5. Provisioning Pipeline

```
1. Check: does the agent already have a leased org?
   - Yes → reuse it (re-deploy to existing org)
   - No → claim from pool or create new

2. If creating new:
   a. sf org create scratch -f {scratchDefPath} -a {alias} -d {days}
   b. Register the new org in the pool
   c. Lease it to the agent

3. Deploy source from agent's worktree:
   sf project deploy start -o {alias} --source-dir {worktreePath}/force-app

4. Load test data (if data plan exists):
   sf data import tree -o {alias} -p {worktreePath}/data/sample-data-plan.json

5. Assign permission sets (from settings or project config):
   sf org assign permset -o {alias} -n {permset1}
   sf org assign permset -o {alias} -n {permset2}

6. Generate login URL:
   sf org open -o {alias} --url-only -r
   (frontdoor URL for auto-login)

7. Return loginUrl to orchestrator
   → Browser pane loads the URL
   → Agent status → QA_READY
```

### 6. Provisioning Configuration

In `~/.sweatshop/settings.json`:
```json
{
  "orgPool": {
    "maxOrgs": 4,
    "scratchDefPath": "config/project-scratch-def.json",
    "defaultDurationDays": 7,
    "dataPlanPath": "data/sample-data-plan.json",
    "permissionSets": ["MyApp_Admin", "MyApp_User"],
    "preWarm": false
  }
}
```

### 7. Stream Provisioning Output

All `sf` commands during provisioning should stream output to the agent's terminal pane via the TerminalManager. The human can watch the deploy progress in real-time.

### 8. Error Handling

- If deploy fails: capture errors, set agent status to ERROR, show errors in chat
- If org creation fails (limit hit): report to orchestrator, queue the ticket for later
- If data load fails: non-fatal — report warning but continue to QA_READY (the org is still usable)
- If permset assignment fails: non-fatal warning

### 9. IPC Additions

```ts
orgs: {
  list: () => ipcRenderer.invoke('org:list'),
  getStatus: () => ipcRenderer.invoke('org:status'),
  claim: (agentId) => ipcRenderer.invoke('org:claim', agentId),
  release: (orgId) => ipcRenderer.invoke('org:release', orgId),
  discover: () => ipcRenderer.invoke('org:discover'),
  register: (alias) => ipcRenderer.invoke('org:register', alias),
  remove: (orgId) => ipcRenderer.invoke('org:remove', orgId),
}
```

### 10. Org Pool UI (Minimal)

Add a small org pool status indicator somewhere visible (settings page or title bar):
- "Orgs: 2/4 available" with a colored dot (green = available, yellow = low, red = none)
- Clicking it opens a simple list of orgs with their status and assigned agent

## Acceptance Criteria

1. Org pool tracks available/leased/expired scratch orgs
2. `claimOrg` enforces 1:1 agent-to-org mapping
3. Auto-discovery finds existing scratch orgs via `sf org list`
4. Provisioning deploys source, loads data, assigns permsets
5. Provisioning produces a frontdoor login URL
6. Deploy errors are captured and reported (agent goes to ERROR)
7. Org is released when agent completes or is stopped
8. Pool status is visible in the UI
9. Max org limit is respected
