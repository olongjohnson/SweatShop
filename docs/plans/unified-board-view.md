# Unified Board View — Replace Stories with Ticket/Agent/Org Board

## Context
The only way to assign a ticket + org to an agent is via the TicketPicker in the ChatPane, which only appears when an agent is IDLE. If someone "sequence breaks" (agent isn't IDLE, or navigates elsewhere), they can't assign or reassign resources. The user wants a unified board to manage all entity relationships from one place, replacing the current Stories view.

## Approach
Replace the Stories view with a three-column Board view: Tickets (left), Agents (center), Orgs (right). All existing Stories functionality (create, edit, filter, search, Deathmark sync, orchestrator dispatch) is preserved in the Tickets column. The Agents column adds assignment controls — assign tickets and orgs to agents, change org on working agents. The Orgs column provides a lightweight operational view of the pool.

The TicketPicker in ChatPane stays as a convenience shortcut.

## New IPC: Targeted Org Assignment

Currently `orgs.claim(agentId)` grabs the *first available* org — you can't pick a specific one. The board needs targeted assignment.

### `src/shared/ipc-channels.ts` — Add 2 channels
- `ORG_ASSIGN: 'org:assign-to-agent'`
- `ORG_UNASSIGN: 'org:unassign-from-agent'`

### `src/shared/types.ts` — Extend `SweatShopAPI.orgs`
- `assignToAgent: (orgId: string, agentId: string) => Promise<void>`
- `unassignFromAgent: (orgId: string) => Promise<void>`

### `src/main/ipc-handlers.ts` — Add 2 handlers
- `ORG_ASSIGN` — validates org isn't leased to another agent, then: `updateOrg(orgId, { status: 'leased', assignedAgentId })` + `updateAgent(agentId, { assignedOrgAlias: org.alias })`
- `ORG_UNASSIGN` — clears agent's `assignedOrgAlias`, then calls `releaseOrg(orgId)`

### `src/main/services/database.ts` — Add helper
- `getOrgById(id: string): ScratchOrg | null` (only `findOrgByAlias` exists today)

### `src/main/preload.ts` — Wire new channels
- Add `assignToAgent` and `unassignFromAgent` to `orgs` namespace

## Files to Create

### 1. `src/renderer/views/BoardView.tsx` (~200 lines)
Parent orchestrator. Fetches all three entity lists on mount, subscribes to agent status changes, manages shared state, renders three columns with `ResizableDivider` between them. Hosts the StoryForm modal and orchestrator status bar (lifted from StoriesView).

### 2. `src/renderer/components/BoardTicketColumn.tsx` (~180 lines)
The left column — essentially the body of the current StoriesView extracted. Ticket list with status dots, priority badges, filter/search, create/edit, Deathmark sync, dispatch to orchestrator, select-all. NEW: shows assigned agent name badge on each ticket.

### 3. `src/renderer/components/BoardAgentColumn.tsx` (~220 lines)
The center column — agent cards with assignment controls:
- **IDLE agents**: ticket dropdown + org dropdown + "Start Work" button (replicates ChatPane TicketPicker logic: build prompt, claim org, call `agents.assign()`)
- **Working agents**: ticket + org shown as labels. "Change Org" dropdown always available (key use case). "Stop" button.
- **QA_READY**: ticket + org labels, note to review in dashboard
- **ERROR**: retry/stop buttons

### 4. `src/renderer/components/BoardOrgColumn.tsx` (~130 lines)
The right column — simplified org pool view. Summary bar (available/leased counts), "Provision" button, org cards with alias, status badge, expiry, assigned agent name. "Release" and "Delete" actions. Full DevHub management stays in the existing OrgDashboard (content pane "Orgs" tab).

## Files to Modify

### 5. `src/renderer/App.tsx`
- Change `AppView` type: `'stories'` → `'board'`
- Import `BoardView` instead of `StoriesView`
- Update `renderBody()`: `case 'board': return <BoardView />`

### 6. `src/renderer/components/TitleBar.tsx`
- Change `AppView` type: `'stories'` → `'board'`
- Rename button label from "Stories" to "Board"
- Update click handler: `activeView === 'board'`

### 7. `src/renderer/App.css`
- Add board layout styles: `.board-view`, `.board-columns`, `.board-column`, `.board-column-header`, `.board-column-body`
- Agent card styles: `.board-agent-card`, `-header`, `-status`, `-assignment`, `-actions`
- Org card styles: `.board-org-card`
- Ticket column reuses existing `.story-row`, `.story-status-dot` classes

## Files to Delete
- `src/renderer/views/StoriesView.tsx` — replaced by BoardView + BoardTicketColumn

## Verification
1. Run `npm run dev`
2. Click "Board" in title bar → three columns appear
3. **Tickets column**: create ticket, filter, search, dispatch to orchestrator — all existing Stories functionality works
4. **Agents column**: select an IDLE agent → pick ticket + org → "Start Work" → agent starts developing
5. **Agents column**: on a working agent → "Change Org" dropdown → select different org → org assignment updates
6. **Orgs column**: provision new org, release leased org, delete expired org
7. Verify TicketPicker in ChatPane still works as before
