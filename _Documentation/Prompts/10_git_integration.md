# Prompt 10 — Git Integration

## Context

You are working on **SweatShop**, an Electron desktop app. Agents need automated branch management: create feature branches, commit work, and merge on approval.

## Task

Build the Git integration service that manages per-agent branches.

## Requirements

### 1. Git Service (`src/main/services/git-service.ts`)

```ts
class GitService {
  private workingDir: string;  // Project root configured in settings

  constructor(workingDir: string);

  // Validate the working directory is a git repo
  async validate(): Promise<{ valid: boolean; error?: string }>;

  // Get the current branch
  async getCurrentBranch(): Promise<string>;

  // Get the configured base branch (from settings, default: 'main')
  getBaseBranch(): string;

  // Create a feature branch for an agent
  async createFeatureBranch(ticketId: string, shortDesc: string): Promise<string>;
  // Returns branch name like 'feature/TICKET-001-login-page'

  // Switch to a branch
  async checkout(branchName: string): Promise<void>;

  // Stage and commit all changes
  async commitAll(branchName: string, message: string): Promise<string>;
  // Returns commit hash

  // Merge a feature branch into the base branch
  async merge(featureBranch: string, strategy: 'squash' | 'merge'): Promise<{
    success: boolean;
    conflictFiles?: string[];
  }>;

  // Check for uncommitted changes on a branch
  async hasChanges(branchName: string): Promise<boolean>;

  // Get list of files modified on a branch (vs base)
  async getModifiedFiles(branchName: string): Promise<string[]>;

  // Get diff summary
  async getDiffSummary(branchName: string): Promise<{
    filesChanged: number;
    insertions: number;
    deletions: number;
  }>;

  // Delete a feature branch (after merge)
  async deleteBranch(branchName: string): Promise<void>;

  // Abort a merge in progress
  async abortMerge(): Promise<void>;
}
```

### 2. Implementation Details

All git operations use `child_process.execFile('git', [...args])`:
- Always pass `--no-pager` to prevent interactive prompts
- Always specify `cwd: this.workingDir`
- Parse stdout for results
- Throw typed errors for known failure modes

**Branch naming:**
```ts
function generateBranchName(ticketId: string, title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
  return `feature/${ticketId}-${slug}`;
}
```

### 3. Merge Flow

When the human approves an agent's work:

```
1. GitService.checkout(baseBranch)
2. git pull origin baseBranch (ensure up-to-date)
3. GitService.merge(featureBranch, strategy)
4. If conflict:
   a. GitService.abortMerge()
   b. Notify the human via chat: "Merge conflict in: [files]"
   c. Agent status → ERROR
   d. Human decides: resolve manually or re-assign to agent
5. If success:
   a. GitService.deleteBranch(featureBranch)
   b. Agent status → IDLE
   c. Ticket status → 'merged'
```

### 4. Concurrent Branch Safety

Multiple agents work on different branches simultaneously. The git service must handle this:

- **Never leave the repo on a feature branch** after an operation — always return to base
- Use `git worktree` if available (allows multiple branches checked out simultaneously in different directories) — this is the ideal approach
- Fallback: serialize git operations through a mutex/lock

**Git worktree approach (preferred):**
```ts
// Each agent gets its own worktree
async createWorktree(agentId: string, branchName: string): Promise<string> {
  const worktreePath = path.join(this.workingDir, '.worktrees', agentId);
  await exec(`git worktree add ${worktreePath} -b ${branchName}`);
  return worktreePath;
  // Agent's shell_exec tool uses this path as its cwd
}

async removeWorktree(agentId: string): Promise<void> {
  const worktreePath = path.join(this.workingDir, '.worktrees', agentId);
  await exec(`git worktree remove ${worktreePath} --force`);
}
```

This way agents truly work in isolation — each has its own directory with its own branch checked out.

### 5. Wire Into Agent Runtime

Update `agent-tools.ts`:
- The `shell_exec` tool's working directory should be the agent's worktree (not the main repo root)
- The agent can run `git add`, `git commit` within its worktree
- The agent should NOT run `git push` — that's handled by the merge flow

Update `agent-manager.ts`:
- On `assignTicket`: create worktree + feature branch
- On `approveWork`: merge feature branch, remove worktree
- On `stopAgent`: remove worktree, optionally delete branch

### 6. IPC Additions

```ts
git: {
  validate: (dir) => ipcRenderer.invoke('git:validate', dir),
  getModifiedFiles: (agentId) => ipcRenderer.invoke('git:modified-files', agentId),
  getDiffSummary: (agentId) => ipcRenderer.invoke('git:diff-summary', agentId),
}
```

### 7. Settings Integration

Add to settings:
```json
{
  "git": {
    "baseBranch": "main",
    "mergeStrategy": "squash",
    "workingDirectory": "/path/to/salesforce/project"
  }
}
```

The working directory is where the Salesforce project lives (the repo that agents will modify).

## Acceptance Criteria

1. Feature branches are created with correct naming convention
2. Git worktrees give each agent an isolated working directory
3. Agents can commit changes within their worktree
4. Merge flow works: checkout base → merge → delete branch
5. Merge conflicts are detected and reported (not silently lost)
6. Multiple agents can work on different branches simultaneously
7. No branch is left checked out after operations complete
8. Modified files list is available for file overlap detection
