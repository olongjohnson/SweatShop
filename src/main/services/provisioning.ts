import { exec } from 'child_process';
import { BrowserWindow } from 'electron';
import { getSettings } from './settings';
import { IPC_CHANNELS } from '../../shared/ipc-channels';

interface ProvisionConfig {
  conscriptId: string;
  campAlias: string;
  worktreePath: string;
}

interface ProvisionResult {
  success: boolean;
  loginUrl?: string;
  errors?: string[];
}

function runCommand(command: string, cwd: string, conscriptId: string): Promise<{ success: boolean; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = exec(command, { cwd, timeout: 600000, maxBuffer: 10 * 1024 * 1024 });

    let stdout = '';
    let stderr = '';

    // Stream output to terminal
    const broadcast = (data: string) => {
      for (const win of BrowserWindow.getAllWindows()) {
        win.webContents.send(IPC_CHANNELS.CONSCRIPT_TERMINAL_DATA, { conscriptId, data });
      }
    };

    child.stdout?.on('data', (data: string) => {
      stdout += data;
      broadcast(data);
    });

    child.stderr?.on('data', (data: string) => {
      stderr += data;
      broadcast(data);
    });

    child.on('close', (code) => {
      resolve({ success: code === 0, stdout, stderr });
    });

    child.on('error', (err) => {
      resolve({ success: false, stdout, stderr: err.message });
    });
  });
}

export class ProvisioningService {
  async provision(config: ProvisionConfig): Promise<ProvisionResult> {
    const settings = getSettings();
    const errors: string[] = [];

    const broadcast = (msg: string) => {
      for (const win of BrowserWindow.getAllWindows()) {
        win.webContents.send(IPC_CHANNELS.CONSCRIPT_TERMINAL_DATA, {
          conscriptId: config.conscriptId,
          data: `\r\n[Provisioning] ${msg}\r\n`,
        });
      }
    };

    // Step 1: Deploy source
    broadcast(`Deploying source to ${config.campAlias}...`);
    const deploy = await this.deploySource(config.campAlias, config.worktreePath, config.conscriptId);
    if (!deploy) {
      return { success: false, errors: ['Source deploy failed'] };
    }

    // Step 2: Load test data (non-fatal)
    const dataPlanPath = settings.campPool?.dataPlanPath;
    if (dataPlanPath) {
      broadcast('Loading test data...');
      const dataOk = await this.loadTestData(config.campAlias, dataPlanPath, config.worktreePath, config.conscriptId);
      if (!dataOk) {
        errors.push('Test data load failed (non-fatal)');
        broadcast('Warning: test data load failed, continuing...');
      }
    }

    // Step 3: Assign permission sets (non-fatal)
    const permsets = settings.campPool?.permissionSets;
    if (permsets && permsets.length > 0) {
      broadcast('Assigning permission sets...');
      const permOk = await this.assignPermissionSets(config.campAlias, permsets, config.worktreePath, config.conscriptId);
      if (!permOk) {
        errors.push('Permission set assignment failed (non-fatal)');
        broadcast('Warning: permset assignment failed, continuing...');
      }
    }

    // Step 4: Get login URL
    broadcast('Generating login URL...');
    const loginUrl = await this.getLoginUrl(config.campAlias, config.worktreePath, config.conscriptId);
    if (!loginUrl) {
      errors.push('Could not generate login URL');
    }

    broadcast(loginUrl ? `Provisioning complete! Login URL ready.` : 'Provisioning complete (no login URL).');

    return { success: true, loginUrl: loginUrl || undefined, errors: errors.length > 0 ? errors : undefined };
  }

  private async deploySource(campAlias: string, worktreePath: string, conscriptId: string): Promise<boolean> {
    const result = await runCommand(
      `sf project deploy start --target-org ${campAlias} --source-dir force-app --ignore-conflicts`,
      worktreePath,
      conscriptId
    );
    return result.success;
  }

  private async loadTestData(campAlias: string, dataPlanPath: string, cwd: string, conscriptId: string): Promise<boolean> {
    const result = await runCommand(
      `sf data import tree --target-org ${campAlias} -p ${dataPlanPath}`,
      cwd,
      conscriptId
    );
    return result.success;
  }

  private async assignPermissionSets(campAlias: string, permsets: string[], cwd: string, conscriptId: string): Promise<boolean> {
    let allOk = true;
    for (const ps of permsets) {
      const result = await runCommand(
        `sf org assign permset --target-org ${campAlias} -n ${ps}`,
        cwd,
        conscriptId
      );
      if (!result.success) allOk = false;
    }
    return allOk;
  }

  private async getLoginUrl(campAlias: string, cwd: string, conscriptId: string): Promise<string | null> {
    const result = await runCommand(
      `sf org open --target-org ${campAlias} --url-only -r`,
      cwd,
      conscriptId
    );
    if (result.success && result.stdout) {
      // Extract URL from output
      const urlMatch = result.stdout.match(/https?:\/\/[^\s]+/);
      return urlMatch ? urlMatch[0] : null;
    }
    return null;
  }
}

export const provisioning = new ProvisioningService();
