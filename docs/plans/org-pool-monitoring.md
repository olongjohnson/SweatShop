# Org Pool Monitoring & Provisioning — Redesign

## Context
The current org pool code is mostly stubs: the orchestrator hardcodes `orgAlias = 'default'`, claiming/release is never called, and the UI is a basic create form. We need a real monitoring dashboard that shows DevHub health, scratch org limits, and live status of each org — plus support for multiple agents sharing an org (the account only has 3 slots).

The SF CLI is installed (`sf` v2.114.5), DevHub "Smoke & Pigeon" is connected (3 active scratch org slots, 6 daily creates), and there's already one scratch org "CognitoDev".

## Approach

### 1. Richer org data from SF CLI (`src/main/services/org-pool.ts`)

**New method: `getDevHubInfo()`** — Runs `sf org list limits --target-org <devhub> --json` and `sf org list --json` to return:
```ts
{
  devHub: { alias, name, connected, instanceUrl },
  limits: { activeScratchOrgs: { used, max }, dailyScratchOrgs: { used, max } },
  scratchOrgs: ScratchOrgDetail[]  // enriched from sf org list
}
```

**New method: `syncOrgs()`** — Replaces `discoverOrgs()`. Runs `sf org list --json`, upserts each scratch org into the DB with enriched fields (orgId, username, edition, namespace, isExpired, devHubUsername). Marks orgs not returned by CLI as `expired`. This becomes the source of truth.

**New method: `deleteOrg(alias)`** — Runs `sf org delete scratch --target-org <alias> -p --json`, then removes from DB.

**New method: `openOrg(alias)`** — Runs `sf org open --target-org <alias> --url-only --json`, returns the frontdoor URL.

**Reuse existing**: `createScratchOrg()`, `registerOrg()`, `sf()` helper, `broadcast()`, `runStreamedCommand()`.

### 2. Enriched ScratchOrg type (`src/shared/types.ts`)

Add optional fields to `ScratchOrg`:
```ts
interface ScratchOrg {
  // existing
  id, alias, status, assignedAgentId, loginUrl, expiresAt, createdAt, updatedAt
  // new
  orgId?: string;         // Salesforce org ID (00D...)
  username?: string;      // e.g. test-xyz@example.com
  edition?: string;       // Developer, Enterprise, etc.
  instanceUrl?: string;   // https://foo.scratch.my.salesforce.com
  devHubAlias?: string;   // which DevHub owns it
  namespace?: string;
  agentIds?: string[];    // multiple agents can share (computed, not stored)
}
```

The `agentIds` field is computed by looking up agents with `assignedOrgAlias = this.alias` rather than stored on the org row. This supports many-agents-per-org naturally.

### 3. New IPC channels (`src/shared/ipc-channels.ts`)
```
ORG_DEVHUB_INFO: 'org:devhub-info'
ORG_SYNC: 'org:sync'
ORG_DELETE: 'org:delete'
ORG_OPEN: 'org:open'
```

Wire through preload + types as usual.

### 4. Database updates (`src/main/services/database.ts`)

Add columns to `scratch_orgs` table (via migration or ALTER):
- `org_id TEXT`
- `username TEXT`
- `edition TEXT`
- `instance_url TEXT`
- `dev_hub_alias TEXT`
- `namespace TEXT`

Update `rowToOrg()` mapper and `registerOrg()` / `updateOrg()` to handle new fields.

### 5. UI — Replace ProvisioningPane with OrgDashboard (`src/renderer/components/OrgDashboard.tsx`)

New component that replaces the "Provision Org" tab content with a full dashboard:

**A. Summary bar** (top):
- DevHub status pill: green "Smoke & Pigeon — Connected" or red "Disconnected"
- Limit badges: "Active: 1/3" and "Daily: 5/6"
- "Sync Orgs" button (runs syncOrgs)
- "New Org" button (opens create dialog)

**B. Org cards** (grid below):
Each org as a card showing:
- Alias (bold) + edition badge
- Status pill: Active (green), Leased (blue), Expired (gray)
- Expiry countdown: "Expires in 4 days" or "Expired"
- Instance URL (truncated, clickable)
- Assigned agents: avatar/name chips (0..N agents)
- Actions: "Open" button (sf org open), "Delete" button (with confirmation)

**C. Create org dialog** (inline, not a modal):
- Alias input
- Duration picker
- Progress area (streams sf output)
- Auto-syncs on completion

### 6. Wire into App.tsx

Rename the "Provision Org" tab to "Orgs" and swap `ProvisioningPane` for `OrgDashboard`.

## Files to Modify

| File | What |
|------|------|
| `src/shared/types.ts` | Enrich ScratchOrg, add DevHubInfo type, update SweatShopAPI |
| `src/shared/ipc-channels.ts` | Add new org channels |
| `src/main/preload.ts` | Wire new IPC methods |
| `src/main/services/database.ts` | New columns + updated mapper |
| `src/main/services/org-pool.ts` | New methods: getDevHubInfo, syncOrgs, deleteOrg, openOrg |
| `src/main/ipc-handlers.ts` | Register new handlers |
| `src/renderer/components/OrgDashboard.tsx` | **New file** — full dashboard component |
| `src/renderer/App.tsx` | Swap ProvisioningPane for OrgDashboard |
| `src/renderer/App.css` | Dashboard styles |

## Verification
1. Build & launch
2. Dashboard loads, shows DevHub health + limits from real SF CLI
3. "Sync Orgs" discovers CognitoDev from `sf org list`
4. "New Org" creates a real scratch org, progress streams, card appears
5. "Open" button opens org in browser
6. "Delete" button deletes org via CLI
