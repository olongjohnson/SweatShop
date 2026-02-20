# SweatShop — Next Steps

## Status (2026-02-20)

All 13 original prompts complete. SDK migration from `@anthropic-ai/sdk` to `@anthropic-ai/claude-agent-sdk` (Claude Code SDK) done. Agents are running, executing tasks in isolated git worktrees, and reaching QA_READY for human review. Multi-agent parallel execution confirmed working.

---

## Priority 1: Scratch Org Provisioning Script in Browser Pane

The org provisioning system (prompt 11) was built but the scratch org creation script hasn't been wired to actually execute and show output in the browser pane.

### What exists today
- `src/main/services/org-pool.ts` — org pool manager (register, claim, release, list)
- `src/main/services/provisioning.ts` — provisioning service (create scratch org, deploy source, assign permsets)
- `src/main/services/browser-manager.ts` — WebContentsView manager for embedded browser
- Settings page has org pool configuration fields

### What needs to happen
1. **Execute `sf org create scratch`** from within SweatShop and stream the output to the UI
   - The provisioning script needs a terminal/output pane visible in the browser area
   - Show real-time progress: creating org, deploying source, assigning permsets, loading data
   - Handle errors gracefully (expired dev hub, limits reached, deploy failures)
2. **Wire the browser pane to load the scratch org** once provisioned
   - Auto-generate frontdoor URL for the org
   - Load it in the WebContentsView so the human can QA
3. **Connect org pool to agent assignment**
   - When an agent is assigned a ticket, auto-claim an available org from the pool
   - If no orgs available, either queue the agent or prompt to create one
   - Release org when work is approved/rejected

### Key questions to resolve
- Should org creation be triggered manually from the UI or automatically when agents need one?
- Should each agent get its own scratch org, or can they share (with access control)?
- How to handle the dev hub auth — is it already authed via `sf` CLI on the machine?

---

## Priority 2: PR / Diff Review Feature

When an agent reaches QA_READY, the human needs to review what changed before approving the merge. Currently there's no way to see the diff.

### Design exploration needed
1. **Diff view options:**
   - Inline diff viewer in the app (like GitHub's split/unified diff view)
   - Use a library like `diff2html` or `monaco-editor` diff mode
   - Or simply show a file list with +/- line counts and let the user click to expand
2. **Data source:**
   - `git diff <baseBranch>...<featureBranch>` gives us the raw diff
   - `GitService.getModifiedFiles()` and `GitService.getDiffSummary()` already exist
   - Need a new `GitService.getFullDiff()` method that returns the raw patch
3. **PR-like experience:**
   - Show file tree of changes (left sidebar)
   - Click a file to see its diff (main area)
   - Summary stats: files changed, insertions, deletions
   - Optional: inline comments/notes before approving
4. **Where it lives in the UI:**
   - New tab/view in the main content area (alongside browser pane)
   - Or a modal/drawer that opens when the agent reaches QA_READY
   - Could replace or augment the current Approve/Reject buttons

### Implementation approach (TBD)
- Add `GitService.getFileDiff(branchName, filePath)` for per-file diffs
- Add IPC channel `AGENT_GET_DIFF` to fetch diff data
- Build a `DiffView` React component using `diff2html` or `monaco-editor`'s diff
- Wire into the QA_READY state in ChatPane/main content area

---

## Backlog

- **Chat message rendering** — agent messages show raw text, should render markdown
- **Terminal pane** — verify xterm.js terminal is receiving agent Bash output properly
- **Analytics dashboard** — token usage, run metrics, intervention tracking (prompt 13 built but verify with live data)
- **Agent error recovery** — when an agent hits ERROR, allow retry/resume
- **Multi-project support** — currently hardcoded to one working directory per session
- **Remove debug logging** — strip `debugLog` file logger from agent-instance.ts and agent-manager.ts once stable
