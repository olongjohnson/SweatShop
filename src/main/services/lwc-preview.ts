import { exec, ChildProcess } from 'child_process';
import { BrowserWindow } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { getSettings } from './settings';
import { IPC_CHANNELS } from '../../shared/ipc-channels';

interface LwcPreviewSession {
  process: ChildProcess;
  componentName: string;
  conscriptId: string;
  campAlias: string;
  worktreePath: string;
  previewUrl: string | null;
  status: 'starting' | 'running' | 'error' | 'stopped';
  stdout: string;
}

class LwcPreviewService {
  private sessions = new Map<string, LwcPreviewSession>();

  /** Extract unique LWC component names from a list of modified file paths */
  extractLwcComponents(filePaths: string[]): string[] {
    const lwcPattern = /force-app\/.*?\/lwc\/([^/]+)\//;
    const components = new Set<string>();
    for (const fp of filePaths) {
      const match = fp.match(lwcPattern);
      if (match) {
        components.add(match[1]);
      }
    }
    return Array.from(components);
  }

  /**
   * Start the LWC dev server for a specific component.
   * Spawns `sf lightning dev component` in the conscript's worktree,
   * parses stdout for the preview URL, and broadcasts output to the renderer.
   */
  async start(conscriptId: string, componentName: string, campAlias?: string): Promise<string> {
    // Stop any existing session for this conscript
    this.stop(conscriptId);

    const settings = getSettings();
    const projectDir = settings.git?.workingDirectory;
    if (!projectDir) {
      throw new Error('No working directory configured');
    }

    const worktreePath = path.join(projectDir, '.worktrees', conscriptId);
    if (!fs.existsSync(worktreePath)) {
      throw new Error(`Worktree not found: ${worktreePath}`);
    }

    const session: LwcPreviewSession = {
      process: null!,
      componentName,
      conscriptId,
      campAlias: campAlias || '',
      worktreePath,
      previewUrl: null,
      status: 'starting',
      stdout: '',
    };

    if (!campAlias) {
      throw new Error('LWC preview requires a camp. Assign a camp to this conscript first.');
    }

    return new Promise<string>((resolve, reject) => {
      const cmd = `sf lightning dev component -n ${componentName} -o ${campAlias}`;

      const child = exec(cmd, { cwd: worktreePath, timeout: 600000, maxBuffer: 10 * 1024 * 1024 });

      session.process = child;
      this.sessions.set(conscriptId, session);

      this.broadcast(IPC_CHANNELS.LWC_PREVIEW_STATUS, {
        conscriptId,
        status: 'starting',
        componentName,
      });

      // Timeout if URL never appears
      const timeout = setTimeout(() => {
        if (!session.previewUrl) {
          session.status = 'error';
          this.broadcast(IPC_CHANNELS.LWC_PREVIEW_STATUS, {
            conscriptId,
            status: 'error',
            error: 'Timed out waiting for dev server URL',
          });
          reject(new Error('Timeout waiting for LWC dev server URL'));
        }
      }, 30000);

      child.stdout?.on('data', (data: string) => {
        session.stdout += data;
        this.broadcast(IPC_CHANNELS.LWC_PREVIEW_OUTPUT, { conscriptId, data });

        // Parse for URL
        if (!session.previewUrl) {
          const urlMatch = session.stdout.match(/https?:\/\/localhost:\d+[^\s]*/);
          if (urlMatch) {
            session.previewUrl = urlMatch[0];
            session.status = 'running';
            clearTimeout(timeout);
            this.broadcast(IPC_CHANNELS.LWC_PREVIEW_STATUS, {
              conscriptId,
              status: 'running',
              previewUrl: session.previewUrl,
              componentName,
            });
            resolve(session.previewUrl);
          }
        }
      });

      let stderrOutput = '';
      child.stderr?.on('data', (data: string) => {
        stderrOutput += data;
        this.broadcast(IPC_CHANNELS.LWC_PREVIEW_OUTPUT, { conscriptId, data });
      });

      child.on('close', (code) => {
        clearTimeout(timeout);
        session.status = 'stopped';
        this.sessions.delete(conscriptId);
        this.broadcast(IPC_CHANNELS.LWC_PREVIEW_STATUS, {
          conscriptId,
          status: 'stopped',
          exitCode: code,
        });
        if (!session.previewUrl) {
          const detail = stderrOutput.trim() || session.stdout.trim() || `exit code ${code}`;
          reject(new Error(`Dev server failed: ${detail}`));
        }
      });

      child.on('error', (err) => {
        clearTimeout(timeout);
        session.status = 'error';
        this.sessions.delete(conscriptId);
        this.broadcast(IPC_CHANNELS.LWC_PREVIEW_STATUS, {
          conscriptId,
          status: 'error',
          error: err.message,
        });
        reject(err);
      });
    });
  }

  /** Stop the dev server for a conscript */
  stop(conscriptId: string): void {
    const session = this.sessions.get(conscriptId);
    if (!session) return;

    try {
      if (session.process && !session.process.killed) {
        session.process.kill('SIGTERM');
        // Force kill after 5 seconds
        setTimeout(() => {
          try {
            if (session.process && !session.process.killed) {
              session.process.kill('SIGKILL');
            }
          } catch { /* already dead */ }
        }, 5000);
      }
    } catch { /* already dead */ }

    session.status = 'stopped';
    this.sessions.delete(conscriptId);
  }

  /** Stop all running preview sessions (app shutdown) */
  stopAll(): void {
    for (const conscriptId of this.sessions.keys()) {
      this.stop(conscriptId);
    }
  }

  /** Get the current session state for a conscript */
  getSession(conscriptId: string): { status: string; previewUrl: string | null; componentName: string } | null {
    const session = this.sessions.get(conscriptId);
    if (!session) return null;
    return {
      status: session.status,
      previewUrl: session.previewUrl,
      componentName: session.componentName,
    };
  }

  private broadcast(channel: string, data: unknown): void {
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send(channel, data);
    }
  }
}

export const lwcPreview = new LwcPreviewService();
