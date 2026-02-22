import { ipcMain, BrowserWindow, dialog } from 'electron';
import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { IPC_CHANNELS } from '../shared/ipc-channels';
import * as dbService from './services/database';
import { generateStoryDetails, generateIdentityDetails, generateWorkflowDetails } from './services/story-generator';
import * as deathmark from './services/deathmark';
import { getSettings, updateSettings } from './services/settings';
import { conscriptManager } from './services/agent-manager';
import { orchestrator } from './services/orchestrator';
import { browserManager } from './services/browser-manager';
import { GitService } from './services/git-service';
import { campPool } from './services/org-pool';
import { analytics } from './services/analytics';
import { lwcPreview } from './services/lwc-preview';
import { pipelineExecutor } from './services/pipeline-executor';

function readProjectDocs(): string {
  const settings = getSettings();
  const workDir = settings.git?.workingDirectory;
  if (!workDir) return '';

  const parts: string[] = [];

  // Read CLAUDE.md
  try {
    const claudeMd = fs.readFileSync(path.join(workDir, 'CLAUDE.md'), 'utf-8');
    parts.push('=== CLAUDE.md ===\n' + claudeMd.slice(0, 3000));
  } catch { /* not found */ }

  // Read README.md
  try {
    const readme = fs.readFileSync(path.join(workDir, 'README.md'), 'utf-8');
    parts.push('=== README.md ===\n' + readme.slice(0, 3000));
  } catch { /* not found */ }

  // Read docs/*.md (limit to 5 files, 2000 chars each)
  try {
    const docsDir = path.join(workDir, 'docs');
    const files = fs.readdirSync(docsDir).filter((f) => f.endsWith('.md')).slice(0, 5);
    for (const file of files) {
      const content = fs.readFileSync(path.join(docsDir, file), 'utf-8');
      parts.push(`=== docs/${file} ===\n` + content.slice(0, 2000));
    }
  } catch { /* not found */ }

  return parts.join('\n\n');
}

export function registerIpcHandlers(): void {
  // Directives
  ipcMain.handle(IPC_CHANNELS.DIRECTIVE_LIST, (_, filter) => {
    return dbService.listDirectives(filter);
  });

  ipcMain.handle(IPC_CHANNELS.DIRECTIVE_GET, (_, id: string) => {
    return dbService.getDirective(id);
  });

  ipcMain.handle(IPC_CHANNELS.DIRECTIVE_CREATE, (_, data) => {
    return dbService.createDirective(data);
  });

  ipcMain.handle(IPC_CHANNELS.DIRECTIVE_UPDATE, (_, id: string, data) => {
    return dbService.updateDirective(id, data);
  });

  ipcMain.handle(IPC_CHANNELS.DIRECTIVE_DELETE, (_, id: string) => {
    return dbService.deleteDirective(id);
  });

  // Conscripts
  ipcMain.handle(IPC_CHANNELS.CONSCRIPT_LIST, () => {
    return dbService.listConscripts();
  });

  ipcMain.handle(IPC_CHANNELS.CONSCRIPT_GET, (_, id: string) => {
    return dbService.getConscript(id);
  });

  ipcMain.handle(IPC_CHANNELS.CONSCRIPT_CREATE, async (_, data) => {
    return conscriptManager.createConscript(data.name || data);
  });

  ipcMain.handle(IPC_CHANNELS.CONSCRIPT_UPDATE, (_, id: string, data) => {
    return dbService.updateConscript(id, data);
  });

  ipcMain.handle(IPC_CHANNELS.CONSCRIPT_ASSIGN, async (_, conscriptId: string, directiveId: string, config) => {
    return conscriptManager.assignDirective(conscriptId, directiveId, config);
  });

  ipcMain.handle(IPC_CHANNELS.CONSCRIPT_APPROVE, async (_, conscriptId: string) => {
    return conscriptManager.approveWork(conscriptId);
  });

  ipcMain.handle(IPC_CHANNELS.CONSCRIPT_REJECT, async (_, conscriptId: string, feedback: string) => {
    return conscriptManager.rejectWork(conscriptId, feedback);
  });

  ipcMain.handle(IPC_CHANNELS.CONSCRIPT_STOP, async (_, conscriptId: string) => {
    return conscriptManager.stopConscript(conscriptId);
  });

  ipcMain.handle(IPC_CHANNELS.CONSCRIPT_SCRAP, async (_, conscriptId: string) => {
    return conscriptManager.scrapWork(conscriptId);
  });

  ipcMain.handle(IPC_CHANNELS.CONSCRIPT_DELETE, async (_, conscriptId: string) => {
    await conscriptManager.stopConscript(conscriptId);
    dbService.deleteConscript(conscriptId);
  });

  // Camps
  ipcMain.handle(IPC_CHANNELS.CAMP_LIST, () => {
    return dbService.listCamps();
  });

  ipcMain.handle(IPC_CHANNELS.CAMP_CLAIM, (_, conscriptId: string) => {
    const settings = getSettings();
    const allowShared = settings.campPool?.allowSharedCamps ?? false;
    const maxPerCamp = settings.campPool?.maxConscriptsPerCamp ?? 3;
    return dbService.claimCamp(conscriptId, allowShared, maxPerCamp);
  });

  ipcMain.handle(IPC_CHANNELS.CAMP_RELEASE, (_, campId: string) => {
    return dbService.releaseCamp(campId);
  });

  ipcMain.handle(IPC_CHANNELS.CAMP_STATUS, async () => {
    return campPool.getStatus();
  });

  ipcMain.handle(IPC_CHANNELS.CAMP_DISCOVER, async () => {
    return campPool.discoverCamps();
  });

  ipcMain.handle(IPC_CHANNELS.CAMP_REGISTER, async (_, alias: string) => {
    return campPool.registerCamp(alias);
  });

  ipcMain.handle(IPC_CHANNELS.CAMP_REMOVE, async (_, campId: string) => {
    return campPool.removeCamp(campId);
  });

  ipcMain.handle(IPC_CHANNELS.CAMP_CREATE_SCRATCH, async (_, alias?: string) => {
    return campPool.createCamp(alias);
  });

  ipcMain.handle(IPC_CHANNELS.CAMP_PROVISION, async (_, alias?: string) => {
    return campPool.provisionNewCamp(alias);
  });

  ipcMain.handle(IPC_CHANNELS.CAMP_DEVHUB_INFO, async () => {
    return campPool.getDevHubInfo();
  });

  ipcMain.handle(IPC_CHANNELS.CAMP_SYNC, async () => {
    return campPool.syncCamps();
  });

  ipcMain.handle(IPC_CHANNELS.CAMP_DELETE, async (_, alias: string) => {
    return campPool.deleteCamp(alias);
  });

  ipcMain.handle(IPC_CHANNELS.CAMP_OPEN, async (_, alias: string) => {
    return campPool.openCamp(alias);
  });

  ipcMain.handle(IPC_CHANNELS.CAMP_OPEN_DEVHUB, async () => {
    return campPool.openDevHub();
  });

  ipcMain.handle(IPC_CHANNELS.CAMP_ASSIGN, async (_, campId: string, conscriptId: string) => {
    const camp = dbService.getCampById(campId);
    if (!camp) throw new Error('Camp not found');
    const settings = getSettings();
    const allowShared = settings.campPool?.allowSharedCamps ?? false;
    const maxPerCamp = settings.campPool?.maxConscriptsPerCamp ?? 3;

    if (allowShared) {
      if (camp.assignedConscriptIds.length >= maxPerCamp) {
        throw new Error(`Camp is at capacity (${maxPerCamp} conscripts)`);
      }
    } else {
      if (camp.assignedConscriptIds.length > 0 && !camp.assignedConscriptIds.includes(conscriptId)) {
        throw new Error('Camp is already leased to another conscript');
      }
    }

    const newIds = camp.assignedConscriptIds.includes(conscriptId)
      ? camp.assignedConscriptIds
      : [...camp.assignedConscriptIds, conscriptId];
    dbService.updateCamp(campId, { status: 'leased', assignedConscriptIds: newIds });
    dbService.updateConscript(conscriptId, { assignedCampAlias: camp.alias });
  });

  ipcMain.handle(IPC_CHANNELS.CAMP_UNASSIGN, async (_, campId: string, conscriptId: string) => {
    const camp = dbService.getCampById(campId);
    if (!camp) throw new Error('Camp not found');
    if (conscriptId) {
      dbService.updateConscript(conscriptId, { assignedCampAlias: undefined });
    }
    dbService.releaseCamp(campId, conscriptId);
  });

  // Chat
  ipcMain.handle(IPC_CHANNELS.CHAT_HISTORY, (_, conscriptId: string) => {
    return dbService.chatHistory(conscriptId);
  });

  ipcMain.handle(IPC_CHANNELS.CHAT_SEND, async (_, conscriptId: string, content: string) => {
    await conscriptManager.sendMessage(conscriptId, content);
    return dbService.chatHistory(conscriptId).slice(-1)[0];
  });

  // Runs
  ipcMain.handle(IPC_CHANNELS.RUN_LIST, (_, directiveId?: string) => {
    return dbService.listRuns(directiveId);
  });

  ipcMain.handle(IPC_CHANNELS.RUN_GET, (_, id: string) => {
    return dbService.getRun(id);
  });

  ipcMain.handle(IPC_CHANNELS.RUN_CURRENT, (_, conscriptId: string) => {
    return dbService.currentRun(conscriptId);
  });

  // Story generation
  ipcMain.handle(IPC_CHANNELS.STORY_GENERATE, async (_, input) => {
    return generateStoryDetails({ ...input, projectContext: readProjectDocs() });
  });

  // Deathmark
  ipcMain.handle(IPC_CHANNELS.DEATHMARK_TEST_CONNECTION, async () => {
    return deathmark.testConnection();
  });

  ipcMain.handle(IPC_CHANNELS.DEATHMARK_SYNC, async () => {
    const partialDirectives = await deathmark.fetchDirectives();
    const created: ReturnType<typeof dbService.createDirective>[] = [];
    for (const t of partialDirectives) {
      // Skip if already imported (check by externalId)
      const existing = dbService.listDirectives().find(
        (e) => e.externalId === t.externalId
      );
      if (existing) {
        created.push(dbService.updateDirective(existing.id, t));
      } else {
        created.push(dbService.createDirective({
          source: 'deathmark',
          title: t.title || 'Untitled',
          description: t.description || '',
          acceptanceCriteria: t.acceptanceCriteria || '',
          labels: t.labels || [],
          priority: t.priority || 'medium',
          status: t.status || 'backlog',
          dependsOn: t.dependsOn || [],
          externalId: t.externalId,
        }));
      }
    }
    return created;
  });

  // Orchestrator
  ipcMain.handle(IPC_CHANNELS.ORCHESTRATOR_LOAD, async (_, directiveIds: string[]) => {
    return orchestrator.loadDirectives(directiveIds);
  });

  ipcMain.handle(IPC_CHANNELS.ORCHESTRATOR_START, async () => {
    return orchestrator.start();
  });

  ipcMain.handle(IPC_CHANNELS.ORCHESTRATOR_STOP, async () => {
    return orchestrator.stop();
  });

  ipcMain.handle(IPC_CHANNELS.ORCHESTRATOR_STATUS, () => {
    return orchestrator.getStatus();
  });

  // Git
  ipcMain.handle(IPC_CHANNELS.GIT_VALIDATE, async (_, dir: string) => {
    const gitService = new GitService(dir);
    return gitService.validate();
  });

  ipcMain.handle(IPC_CHANNELS.GIT_MODIFIED_FILES, async (_, conscriptId: string) => {
    const conscript = dbService.getConscript(conscriptId);
    if (!conscript?.branchName) return [];
    const settings = getSettings();
    const projectDir = settings.git?.workingDirectory || process.cwd();
    const gitService = new GitService(projectDir);
    return gitService.getModifiedFiles(conscript.branchName);
  });

  ipcMain.handle(IPC_CHANNELS.GIT_DIFF_SUMMARY, async (_, conscriptId: string) => {
    const conscript = dbService.getConscript(conscriptId);
    if (!conscript?.branchName) return { filesChanged: 0, insertions: 0, deletions: 0 };
    const settings = getSettings();
    const projectDir = settings.git?.workingDirectory || process.cwd();
    const gitService = new GitService(projectDir);
    return gitService.getDiffSummary(conscript.branchName);
  });

  ipcMain.handle(IPC_CHANNELS.GIT_FULL_DIFF, async (_, conscriptId: string) => {
    const conscript = dbService.getConscript(conscriptId);
    if (!conscript?.branchName) return '';
    const settings = getSettings();
    const projectDir = settings.git?.workingDirectory || process.cwd();
    const gitService = new GitService(projectDir);
    return gitService.getFullDiff(conscript.branchName);
  });

  ipcMain.handle(IPC_CHANNELS.GIT_FILE_DIFF, async (_, conscriptId: string, filePath: string) => {
    const conscript = dbService.getConscript(conscriptId);
    if (!conscript?.branchName) return '';
    const settings = getSettings();
    const projectDir = settings.git?.workingDirectory || process.cwd();
    const gitService = new GitService(projectDir);
    return gitService.getFileDiff(conscript.branchName, filePath);
  });

  ipcMain.handle(IPC_CHANNELS.GIT_FILES_WITH_STATS, async (_, conscriptId: string) => {
    const conscript = dbService.getConscript(conscriptId);
    if (!conscript?.branchName) return [];
    const settings = getSettings();
    const projectDir = settings.git?.workingDirectory || process.cwd();
    const gitService = new GitService(projectDir);
    return gitService.getModifiedFilesWithStats(conscript.branchName);
  });

  ipcMain.handle(IPC_CHANNELS.GIT_COMMIT_LOG, async (_, conscriptId: string) => {
    const conscript = dbService.getConscript(conscriptId);
    if (!conscript?.branchName) return [];
    const settings = getSettings();
    const projectDir = settings.git?.workingDirectory || process.cwd();
    const gitService = new GitService(projectDir);
    return gitService.getCommitLog(conscript.branchName);
  });

  // Browser
  ipcMain.handle(IPC_CHANNELS.BROWSER_LOAD_URL, (_, conscriptId: string, url: string) => {
    browserManager.create(conscriptId);
    browserManager.loadURL(conscriptId, url);
  });

  ipcMain.handle(IPC_CHANNELS.BROWSER_SET_BOUNDS, (_, conscriptId: string, bounds) => {
    browserManager.setBounds(conscriptId, bounds);
  });

  ipcMain.handle(IPC_CHANNELS.BROWSER_BACK, (_, conscriptId: string) => {
    browserManager.goBack(conscriptId);
  });

  ipcMain.handle(IPC_CHANNELS.BROWSER_FORWARD, (_, conscriptId: string) => {
    browserManager.goForward(conscriptId);
  });

  ipcMain.handle(IPC_CHANNELS.BROWSER_RELOAD, (_, conscriptId: string) => {
    browserManager.reload(conscriptId);
  });

  ipcMain.handle(IPC_CHANNELS.BROWSER_GET_URL, (_, conscriptId: string) => {
    return browserManager.getURL(conscriptId);
  });

  ipcMain.handle(IPC_CHANNELS.BROWSER_SHOW, (_, conscriptId: string, bounds) => {
    browserManager.show(conscriptId, bounds);
  });

  ipcMain.handle(IPC_CHANNELS.BROWSER_HIDE_ALL, () => {
    browserManager.hideAll();
  });

  ipcMain.handle(IPC_CHANNELS.BROWSER_CREATE_LOCAL_PREVIEW, (_, viewId: string) => {
    browserManager.createLocalPreview(viewId);
  });

  ipcMain.handle(IPC_CHANNELS.BROWSER_LOAD_LOCAL_URL, (_, viewId: string, url: string) => {
    browserManager.loadLocalURL(viewId, url);
  });

  // LWC Preview
  ipcMain.handle(IPC_CHANNELS.LWC_PREVIEW_DETECT, async (_, conscriptId: string) => {
    const conscript = dbService.getConscript(conscriptId);
    if (!conscript?.branchName) return [];
    const settings = getSettings();
    const projectDir = settings.git?.workingDirectory || '';
    if (!projectDir) return [];
    const gitService = new GitService(projectDir);
    const files = await gitService.getModifiedFiles(conscript.branchName);
    return lwcPreview.extractLwcComponents(files);
  });

  ipcMain.handle(IPC_CHANNELS.LWC_PREVIEW_START, async (_, conscriptId: string, componentName: string) => {
    const conscript = dbService.getConscript(conscriptId);
    if (!conscript) throw new Error('Conscript not found');
    return lwcPreview.start(conscriptId, componentName, conscript.assignedCampAlias || undefined);
  });

  ipcMain.handle(IPC_CHANNELS.LWC_PREVIEW_STOP, async (_, conscriptId: string) => {
    lwcPreview.stop(conscriptId);
  });

  ipcMain.handle(IPC_CHANNELS.LWC_PREVIEW_GET_SESSION, (_, conscriptId: string) => {
    return lwcPreview.getSession(conscriptId);
  });

  // Claude Code auth status
  ipcMain.handle(IPC_CHANNELS.CLAUDE_AUTH_STATUS, async () => {
    // Check for ANTHROPIC_API_KEY env var
    if (process.env.ANTHROPIC_API_KEY) {
      return { authenticated: true, method: 'API Key (env var)' };
    }

    // Use the CLI's own auth status command
    const cliPath = require.resolve('@anthropic-ai/claude-code/cli.js');
    try {
      const result = await new Promise<string>((resolve, reject) => {
        const child = spawn(process.execPath, [cliPath, 'auth', 'status'], {
          env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
          stdio: ['ignore', 'pipe', 'pipe'],
        });
        let stdout = '';
        child.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
        child.on('close', (code) => code === 0 ? resolve(stdout) : reject(new Error(stdout)));
        child.on('error', reject);
      });

      const status = JSON.parse(result.trim());
      if (status.loggedIn) {
        const method = status.email
          ? `${status.authMethod} (${status.email})`
          : status.authMethod || 'Claude Code';
        return { authenticated: true, method };
      }
    } catch {
      // CLI not available or parse error — fall through
    }

    return {
      authenticated: false,
      method: 'none',
      error: 'Not authenticated.',
    };
  });

  // Claude Code auth login
  ipcMain.handle(IPC_CHANNELS.CLAUDE_AUTH_LOGIN, async (event) => {
    const pathMod = await import('path');
    const cliPath = require.resolve('@anthropic-ai/claude-code/cli.js');

    const win = BrowserWindow.fromWebContents(event.sender);
    const sendOutput = (text: string, done: boolean) => {
      if (win && !win.isDestroyed()) {
        win.webContents.send(IPC_CHANNELS.CLAUDE_AUTH_LOGIN_OUTPUT, { text, done });
      }
    };

    return new Promise<{ success: boolean; error?: string }>((resolve) => {
      const env = { ...process.env, ELECTRON_RUN_AS_NODE: '1' };

      const child = spawn(process.execPath, [cliPath, 'auth', 'login'], {
        env,
        cwd: pathMod.join(__dirname, '..', '..'),
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let stderrBuf = '';

      child.stdout.on('data', (chunk: Buffer) => {
        const text = chunk.toString();
        sendOutput(text, false);
      });

      child.stderr.on('data', (chunk: Buffer) => {
        const text = chunk.toString();
        stderrBuf += text;
        sendOutput(text, false);
      });

      child.on('error', (err) => {
        sendOutput(`Error: ${err.message}`, true);
        resolve({ success: false, error: err.message });
      });

      child.on('close', (code) => {
        sendOutput('', true);
        if (code === 0) {
          resolve({ success: true });
        } else {
          resolve({ success: false, error: stderrBuf.trim() || `Process exited with code ${code}` });
        }
      });
    });
  });

  // Identity Templates
  ipcMain.handle(IPC_CHANNELS.IDENTITY_GENERATE, async (_, input) => {
    return generateIdentityDetails({ ...input, projectContext: readProjectDocs() });
  });

  ipcMain.handle(IPC_CHANNELS.IDENTITY_LIST, () => {
    return dbService.listIdentityTemplates();
  });

  ipcMain.handle(IPC_CHANNELS.IDENTITY_GET, (_, id: string) => {
    return dbService.getIdentityTemplate(id);
  });

  ipcMain.handle(IPC_CHANNELS.IDENTITY_CREATE, (_, data) => {
    return dbService.createIdentityTemplate(data);
  });

  ipcMain.handle(IPC_CHANNELS.IDENTITY_UPDATE, (_, id: string, data) => {
    return dbService.updateIdentityTemplate(id, data);
  });

  ipcMain.handle(IPC_CHANNELS.IDENTITY_DELETE, (_, id: string) => {
    return dbService.deleteIdentityTemplate(id);
  });

  // Workflow Templates
  ipcMain.handle(IPC_CHANNELS.WORKFLOW_GENERATE, async (_, input) => {
    return generateWorkflowDetails({ ...input, projectContext: readProjectDocs() });
  });

  ipcMain.handle(IPC_CHANNELS.WORKFLOW_LIST, () => {
    return dbService.listWorkflowTemplates();
  });

  ipcMain.handle(IPC_CHANNELS.WORKFLOW_GET, (_, id: string) => {
    return dbService.getWorkflowTemplate(id);
  });

  ipcMain.handle(IPC_CHANNELS.WORKFLOW_CREATE, (_, data) => {
    return dbService.createWorkflowTemplate(data);
  });

  ipcMain.handle(IPC_CHANNELS.WORKFLOW_UPDATE, (_, id: string, data) => {
    return dbService.updateWorkflowTemplate(id, data);
  });

  ipcMain.handle(IPC_CHANNELS.WORKFLOW_DELETE, (_, id: string) => {
    return dbService.deleteWorkflowTemplate(id);
  });

  // Pipeline
  ipcMain.handle(IPC_CHANNELS.PIPELINE_GET_RUN, (_, directiveId: string) => {
    return dbService.getPipelineRunForDirective(directiveId);
  });

  ipcMain.handle(IPC_CHANNELS.PIPELINE_RESUME_HUMAN, async (_, pipelineRunId: string, input: string) => {
    pipelineExecutor.resumeHumanStage(pipelineRunId, input);
  });

  // Settings
  ipcMain.handle(IPC_CHANNELS.SETTINGS_GET, () => {
    return getSettings();
  });

  ipcMain.handle(IPC_CHANNELS.SETTINGS_UPDATE, (_, data) => {
    return updateSettings(data);
  });

  ipcMain.handle(IPC_CHANNELS.SETTINGS_PICK_DIRECTORY, async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const result = await dialog.showOpenDialog(win!, {
      properties: ['openDirectory'],
      title: 'Select Directory',
    });
    return result.canceled ? null : result.filePaths[0];
  });

  ipcMain.handle(IPC_CHANNELS.SETTINGS_PICK_FILE, async (event, filters?) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const result = await dialog.showOpenDialog(win!, {
      properties: ['openFile'],
      title: 'Select File',
      filters: filters || [{ name: 'All Files', extensions: ['*'] }],
    });
    return result.canceled ? null : result.filePaths[0];
  });

  // Analytics
  ipcMain.handle(IPC_CHANNELS.ANALYTICS_RUN, (_, runId: string) => {
    return analytics.getRunMetrics(runId);
  });

  ipcMain.handle(IPC_CHANNELS.ANALYTICS_CONSCRIPT, (_, conscriptId: string) => {
    return analytics.getConscriptMetrics(conscriptId);
  });

  ipcMain.handle(IPC_CHANNELS.ANALYTICS_SESSION, (_, options) => {
    return analytics.getSessionMetrics(options);
  });

  ipcMain.handle(IPC_CHANNELS.ANALYTICS_TREND, (_, metric: string, options) => {
    return analytics.getTrend(metric, options);
  });

  ipcMain.handle(IPC_CHANNELS.ANALYTICS_EXPORT, (_, options) => {
    return analytics.exportMetrics(options);
  });
}
