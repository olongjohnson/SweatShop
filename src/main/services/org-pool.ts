import { exec, execFile } from 'child_process';
import { BrowserWindow } from 'electron';
import * as dbService from './database';
import { getSettings } from './settings';
import { IPC_CHANNELS } from '../../shared/ipc-channels';
import type { ScratchOrg } from '../../shared/types';

function sf(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile('sf', args, { timeout: 120000, maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) reject(new Error(stderr || err.message));
      else resolve(stdout.trim());
    });
  });
}

function broadcast(channel: string, data: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(channel, data);
  }
}

function runStreamedCommand(command: string, cwd: string): Promise<{ success: boolean; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = exec(command, { cwd, timeout: 600000, maxBuffer: 10 * 1024 * 1024 });
    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', (data: string) => {
      stdout += data;
      broadcast(IPC_CHANNELS.ORG_PROVISION_OUTPUT, { data });
    });

    child.stderr?.on('data', (data: string) => {
      stderr += data;
      broadcast(IPC_CHANNELS.ORG_PROVISION_OUTPUT, { data });
    });

    child.on('close', (code) => {
      resolve({ success: code === 0, stdout, stderr });
    });

    child.on('error', (err) => {
      resolve({ success: false, stdout, stderr: err.message });
    });
  });
}

export class OrgPoolService {
  async registerOrg(alias: string, options?: {
    expiresAt?: string;
    loginUrl?: string;
  }): Promise<ScratchOrg> {
    const existing = dbService.listOrgs().find((o) => o.alias === alias);
    if (existing) return existing;

    return dbService.registerOrg({
      alias,
      status: 'available',
      expiresAt: options?.expiresAt,
      loginUrl: options?.loginUrl,
    });
  }

  async claimOrg(agentId: string): Promise<ScratchOrg | null> {
    return dbService.claimOrg(agentId);
  }

  async releaseOrg(orgId: string): Promise<void> {
    dbService.releaseOrg(orgId);
  }

  async getStatus(): Promise<{
    total: number;
    available: number;
    leased: number;
    expired: number;
  }> {
    const orgs = dbService.listOrgs();
    return {
      total: orgs.length,
      available: orgs.filter((o) => o.status === 'available').length,
      leased: orgs.filter((o) => o.status === 'leased').length,
      expired: orgs.filter((o) => o.status === 'expired').length,
    };
  }

  async listOrgs(): Promise<ScratchOrg[]> {
    return dbService.listOrgs();
  }

  async refreshOrgStatus(): Promise<void> {
    const orgs = dbService.listOrgs();
    const now = new Date();

    for (const org of orgs) {
      if (org.expiresAt && new Date(org.expiresAt) < now && org.status !== 'expired') {
        dbService.updateOrg(org.id, { status: 'expired' });
      }
    }
  }

  async removeOrg(orgId: string): Promise<void> {
    dbService.deleteOrg(orgId);
  }

  /**
   * Create a new scratch org and register it in the pool.
   * Streams all command output to the renderer via ORG_PROVISION_OUTPUT.
   */
  async createScratchOrg(alias?: string): Promise<ScratchOrg | null> {
    const settings = getSettings();
    const poolSettings = settings.orgPool;
    const workingDir = settings.git?.workingDirectory || process.cwd();

    const orgAlias = alias || `scratch-${Date.now()}`;
    const defPath = poolSettings?.scratchDefPath || 'config/project-scratch-def.json';
    const duration = poolSettings?.defaultDurationDays || 7;

    broadcast(IPC_CHANNELS.ORG_PROVISION_OUTPUT, {
      data: `[OrgPool] Creating scratch org "${orgAlias}" (duration: ${duration} days)...\r\n`,
    });

    const createCmd = `sf org create scratch --definition-file ${defPath} --alias ${orgAlias} --duration-days ${duration} --set-default --json`;
    const result = await runStreamedCommand(createCmd, workingDir);

    if (!result.success) {
      broadcast(IPC_CHANNELS.ORG_PROVISION_OUTPUT, {
        data: `\r\n[OrgPool] ERROR: Failed to create scratch org.\r\n`,
      });
      return null;
    }

    // Parse the JSON result to get expiration date
    let expiresAt: string | undefined;
    let loginUrl: string | undefined;
    try {
      const parsed = JSON.parse(result.stdout);
      expiresAt = parsed?.result?.expirationDate;
      loginUrl = parsed?.result?.instanceUrl;
    } catch {
      // Non-JSON output, that's OK
    }

    broadcast(IPC_CHANNELS.ORG_PROVISION_OUTPUT, {
      data: `\r\n[OrgPool] Scratch org "${orgAlias}" created successfully.\r\n`,
    });

    // Generate login URL
    broadcast(IPC_CHANNELS.ORG_PROVISION_OUTPUT, {
      data: `[OrgPool] Generating login URL...\r\n`,
    });

    const urlResult = await runStreamedCommand(
      `sf org open --target-org ${orgAlias} --url-only -r`,
      workingDir
    );

    if (urlResult.success && urlResult.stdout) {
      const urlMatch = urlResult.stdout.match(/https?:\/\/[^\s"]+/);
      if (urlMatch) loginUrl = urlMatch[0];
    }

    // Register in pool
    const org = await this.registerOrg(orgAlias, { expiresAt, loginUrl });

    broadcast(IPC_CHANNELS.ORG_PROVISION_OUTPUT, {
      data: `[OrgPool] Org registered in pool. ${loginUrl ? 'Login URL ready.' : 'No login URL.'}\r\n`,
    });

    return org;
  }

  async discoverOrgs(): Promise<ScratchOrg[]> {
    try {
      const output = await sf(['org', 'list', '--json']);
      const parsed = JSON.parse(output);
      const scratchOrgs = parsed?.result?.scratchOrgs || [];

      const registered: ScratchOrg[] = [];
      for (const sfOrg of scratchOrgs) {
        const alias = sfOrg.alias || sfOrg.username;
        if (!alias) continue;

        const org = await this.registerOrg(alias, {
          expiresAt: sfOrg.expirationDate,
          loginUrl: sfOrg.instanceUrl,
        });
        registered.push(org);
      }

      return registered;
    } catch (err) {
      console.error('[OrgPool] Discovery failed:', err);
      return [];
    }
  }
}

export const orgPool = new OrgPoolService();
