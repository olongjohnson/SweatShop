import { execFile } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import { getSettings } from './settings';

function git(args: string[], cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile('git', ['--no-pager', ...args], { cwd, maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) {
        reject(new Error(`git ${args[0]} failed: ${stderr || err.message}`));
      } else {
        resolve(stdout.trim());
      }
    });
  });
}

function generateBranchName(directiveId: string, title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
  return `feature/${directiveId}-${slug}`;
}

export class GitService {
  private workingDir: string;

  constructor(workingDir: string) {
    this.workingDir = workingDir;
  }

  async validate(): Promise<{ valid: boolean; error?: string }> {
    try {
      await git(['rev-parse', '--git-dir'], this.workingDir);
      return { valid: true };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      return { valid: false, error: msg };
    }
  }

  async getCurrentBranch(): Promise<string> {
    return git(['rev-parse', '--abbrev-ref', 'HEAD'], this.workingDir);
  }

  getBaseBranch(): string {
    const settings = getSettings();
    return settings.git?.baseBranch || 'main';
  }

  async createFeatureBranch(directiveId: string, title: string): Promise<string> {
    const branchName = generateBranchName(directiveId, title);
    const baseBranch = this.getBaseBranch();

    // Ensure base is up to date
    await git(['checkout', baseBranch], this.workingDir);
    try {
      await git(['pull', 'origin', baseBranch], this.workingDir);
    } catch {
      // Might not have remote, that's OK
    }

    // Create the feature branch
    await git(['checkout', '-b', branchName], this.workingDir);
    // Return to base
    await git(['checkout', baseBranch], this.workingDir);

    return branchName;
  }

  /**
   * Create a git worktree for a conscript — gives them an isolated working directory.
   */
  async createWorktree(conscriptId: string, branchName: string): Promise<string> {
    const worktreePath = path.join(this.workingDir, '.worktrees', conscriptId);
    const baseBranch = this.getBaseBranch();

    // Clean up stale worktree if exists
    if (fs.existsSync(worktreePath)) {
      try {
        await git(['worktree', 'remove', worktreePath, '--force'], this.workingDir);
      } catch { /* ignore */ }
    }

    // Delete stale branch if it already exists (from a previous failed attempt)
    try {
      await git(['branch', '-D', branchName], this.workingDir);
    } catch { /* branch didn't exist, that's fine */ }

    // Ensure .worktrees directory exists
    fs.mkdirSync(path.join(this.workingDir, '.worktrees'), { recursive: true });

    // Use -b to create the new branch off the base branch
    await git(['worktree', 'add', '-b', branchName, worktreePath, baseBranch], this.workingDir);
    return worktreePath;
  }

  /**
   * Remove a conscript's worktree.
   */
  async removeWorktree(conscriptId: string): Promise<void> {
    const worktreePath = path.join(this.workingDir, '.worktrees', conscriptId);
    if (!fs.existsSync(worktreePath)) return;

    try {
      await git(['worktree', 'remove', worktreePath, '--force'], this.workingDir);
    } catch {
      // Force remove directory if git worktree remove fails
      fs.rmSync(worktreePath, { recursive: true, force: true });
      await git(['worktree', 'prune'], this.workingDir);
    }
  }

  async checkout(branchName: string): Promise<void> {
    await git(['checkout', branchName], this.workingDir);
  }

  async commitAll(cwd: string, message: string): Promise<string> {
    await git(['add', '-A'], cwd);
    await git(['commit', '-m', message, '--allow-empty'], cwd);
    return git(['rev-parse', 'HEAD'], cwd);
  }

  async merge(
    featureBranch: string,
    strategy: 'squash' | 'merge'
  ): Promise<{ success: boolean; conflictFiles?: string[] }> {
    const baseBranch = this.getBaseBranch();

    await git(['checkout', baseBranch], this.workingDir);
    try {
      await git(['pull', 'origin', baseBranch], this.workingDir);
    } catch { /* no remote, OK */ }

    try {
      if (strategy === 'squash') {
        await git(['merge', '--squash', featureBranch], this.workingDir);
        await git(['commit', '-m', `Merge ${featureBranch} (squash)`], this.workingDir);
      } else {
        await git(['merge', '--no-ff', featureBranch, '-m', `Merge ${featureBranch}`], this.workingDir);
      }
      return { success: true };
    } catch (err: unknown) {
      // Detect merge conflicts
      try {
        const status = await git(['diff', '--name-only', '--diff-filter=U'], this.workingDir);
        const conflictFiles = status.split('\n').filter(Boolean);
        return { success: false, conflictFiles };
      } catch {
        const msg = err instanceof Error ? err.message : 'Unknown merge error';
        return { success: false, conflictFiles: [msg] };
      }
    }
  }

  async hasChanges(cwd: string): Promise<boolean> {
    const status = await git(['status', '--porcelain'], cwd);
    return status.length > 0;
  }

  async getModifiedFiles(branchName: string): Promise<string[]> {
    const baseBranch = this.getBaseBranch();
    try {
      const output = await git(['diff', '--name-only', `${baseBranch}...${branchName}`], this.workingDir);
      return output.split('\n').filter(Boolean);
    } catch {
      return [];
    }
  }

  async getDiffSummary(branchName: string): Promise<{
    filesChanged: number;
    insertions: number;
    deletions: number;
  }> {
    const baseBranch = this.getBaseBranch();
    try {
      const output = await git(['diff', '--shortstat', `${baseBranch}...${branchName}`], this.workingDir);
      // Parse: "3 files changed, 10 insertions(+), 2 deletions(-)"
      const filesMatch = output.match(/(\d+) files? changed/);
      const insMatch = output.match(/(\d+) insertions?/);
      const delMatch = output.match(/(\d+) deletions?/);
      return {
        filesChanged: filesMatch ? parseInt(filesMatch[1]) : 0,
        insertions: insMatch ? parseInt(insMatch[1]) : 0,
        deletions: delMatch ? parseInt(delMatch[1]) : 0,
      };
    } catch {
      return { filesChanged: 0, insertions: 0, deletions: 0 };
    }
  }

  async getFullDiff(branchName: string): Promise<string> {
    const baseBranch = this.getBaseBranch();
    try {
      return await git(['diff', `${baseBranch}...${branchName}`], this.workingDir);
    } catch {
      return '';
    }
  }

  async getFileDiff(branchName: string, filePath: string): Promise<string> {
    const baseBranch = this.getBaseBranch();
    try {
      return await git(['diff', `${baseBranch}...${branchName}`, '--', filePath], this.workingDir);
    } catch {
      return '';
    }
  }

  async getModifiedFilesWithStats(branchName: string): Promise<Array<{
    path: string;
    insertions: number;
    deletions: number;
  }>> {
    const baseBranch = this.getBaseBranch();
    try {
      const output = await git(['diff', '--numstat', `${baseBranch}...${branchName}`], this.workingDir);
      return output.split('\n').filter(Boolean).map((line) => {
        const [ins, del, path] = line.split('\t');
        return {
          path,
          insertions: ins === '-' ? 0 : parseInt(ins),
          deletions: del === '-' ? 0 : parseInt(del),
        };
      });
    } catch {
      return [];
    }
  }

  async deleteBranch(branchName: string): Promise<void> {
    await git(['branch', '-D', branchName], this.workingDir);
  }

  async getCommitLog(branchName: string): Promise<Array<{
    hash: string;
    shortHash: string;
    subject: string;
    author: string;
    date: string;
  }>> {
    const baseBranch = this.getBaseBranch();
    try {
      const output = await git(
        ['log', '--format=%H|%h|%s|%an|%aI', `${baseBranch}..${branchName}`],
        this.workingDir
      );
      return output.split('\n').filter(Boolean).map((line) => {
        const [hash, shortHash, ...rest] = line.split('|');
        const date = rest.pop()!;
        const author = rest.pop()!;
        const subject = rest.join('|'); // subject may contain |
        return { hash, shortHash, subject, author, date };
      });
    } catch {
      return [];
    }
  }

  async abortMerge(): Promise<void> {
    await git(['merge', '--abort'], this.workingDir);
  }
}
