import { exec, execFile } from 'child_process';
import { BrowserWindow } from 'electron';
import * as dbService from './database';
import { getSettings } from './settings';
import { IPC_CHANNELS } from '../../shared/ipc-channels';
import type { Camp, DevHubInfo } from '../../shared/types';

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
      broadcast(IPC_CHANNELS.CAMP_PROVISION_OUTPUT, { data });
    });

    child.stderr?.on('data', (data: string) => {
      stderr += data;
      broadcast(IPC_CHANNELS.CAMP_PROVISION_OUTPUT, { data });
    });

    child.on('close', (code) => {
      resolve({ success: code === 0, stdout, stderr });
    });

    child.on('error', (err) => {
      resolve({ success: false, stdout, stderr: err.message });
    });
  });
}

/** Parse JSON from SF CLI output, stripping any warning lines before the JSON. */
function parseSfJson(raw: string): any {
  const idx = raw.indexOf('{');
  if (idx === -1) throw new Error('No JSON in output');
  return JSON.parse(raw.slice(idx));
}

export class CampPoolService {
  // ── Core methods ──

  async registerCamp(alias: string, options?: Partial<Camp>): Promise<Camp> {
    const existing = dbService.findCampByAlias(alias);
    if (existing) {
      if (options) dbService.updateCamp(existing.id, options);
      return { ...existing, ...options };
    }

    return dbService.registerCamp({
      alias,
      status: options?.status || 'available',
      expiresAt: options?.expiresAt,
      loginUrl: options?.loginUrl,
      campId: options?.campId,
      username: options?.username,
      edition: options?.edition,
      instanceUrl: options?.instanceUrl,
      devHubAlias: options?.devHubAlias,
      namespace: options?.namespace,
    });
  }

  async claimCamp(conscriptId: string): Promise<Camp | null> {
    const settings = getSettings();
    const allowShared = settings.campPool?.allowSharedCamps ?? false;
    const maxPerCamp = settings.campPool?.maxConscriptsPerCamp ?? 3;
    return dbService.claimCamp(conscriptId, allowShared, maxPerCamp);
  }

  async releaseCamp(campId: string): Promise<void> {
    dbService.releaseCamp(campId);
  }

  async getStatus() {
    const camps = dbService.listCamps();
    return {
      total: camps.length,
      available: camps.filter((o) => o.status === 'available').length,
      leased: camps.filter((o) => o.status === 'leased').length,
      expired: camps.filter((o) => o.status === 'expired').length,
    };
  }

  async listCamps(): Promise<Camp[]> {
    return dbService.listCamps();
  }

  async removeCamp(campId: string): Promise<void> {
    dbService.deleteCamp(campId);
  }

  // ── DevHub Info ──

  async getDevHubInfo(): Promise<DevHubInfo> {
    const empty: DevHubInfo = {
      devHub: null,
      limits: {
        activeScratchOrgs: { used: 0, max: 0 },
        dailyScratchOrgs: { used: 0, max: 0 },
      },
      camps: [],
    };

    try {
      const listRaw = await sf(['org', 'list', '--json']);
      const listData = parseSfJson(listRaw);

      const devHubs = listData?.result?.devHubs || listData?.result?.nonScratchOrgs?.filter((o: any) => o.isDevHub) || [];
      const hub = devHubs[0];
      if (!hub) return empty;

      const devHubAlias = hub.alias || hub.username;

      let activeLimits = { used: 0, max: 0 };
      let dailyLimits = { used: 0, max: 0 };
      try {
        const limitsRaw = await sf(['org', 'list', 'limits', '--target-org', devHubAlias, '--json']);
        const limitsData = parseSfJson(limitsRaw);
        for (const lim of limitsData?.result || []) {
          if (lim.name === 'ActiveScratchOrgs') {
            activeLimits = { used: lim.max - lim.remaining, max: lim.max };
          }
          if (lim.name === 'DailyScratchOrgs') {
            dailyLimits = { used: lim.max - lim.remaining, max: lim.max };
          }
        }
      } catch {
        // Limits unavailable
      }

      const cliCamps = listData?.result?.scratchOrgs || [];
      const camps: Camp[] = cliCamps.map((o: any) => ({
        id: '',
        alias: o.alias || o.username || '',
        status: o.isExpired ? 'expired' as const : 'available' as const,
        expiresAt: o.expirationDate,
        instanceUrl: o.instanceUrl,
        loginUrl: o.loginUrl || o.instanceUrl,
        campId: o.orgId,
        username: o.username,
        edition: o.edition,
        devHubAlias,
        namespace: o.namespace,
        createdAt: o.createdDate || '',
        updatedAt: '',
      }));

      return {
        devHub: {
          alias: devHubAlias,
          name: hub.name || hub.orgName || devHubAlias,
          connected: hub.connectedStatus === 'Connected',
          instanceUrl: hub.instanceUrl || '',
        },
        limits: { activeScratchOrgs: activeLimits, dailyScratchOrgs: dailyLimits },
        camps,
      };
    } catch (err) {
      console.error('[CampPool] getDevHubInfo failed:', err);
      return empty;
    }
  }

  // ── Sync from CLI into DB ──

  async syncCamps(): Promise<Camp[]> {
    try {
      const info = await this.getDevHubInfo();
      const cliAliases = new Set<string>();

      for (const cliCamp of info.camps) {
        const key = cliCamp.alias || cliCamp.username;
        if (!key) continue;
        if (!cliCamp.alias) cliCamp.alias = cliCamp.username!;
        cliAliases.add(cliCamp.alias);

        await this.registerCamp(cliCamp.alias, {
          status: cliCamp.status,
          expiresAt: cliCamp.expiresAt,
          instanceUrl: cliCamp.instanceUrl,
          loginUrl: cliCamp.loginUrl,
          campId: cliCamp.campId,
          username: cliCamp.username,
          edition: cliCamp.edition,
          devHubAlias: cliCamp.devHubAlias,
          namespace: cliCamp.namespace,
        });
      }

      const dbCamps = dbService.listCamps();
      for (const camp of dbCamps) {
        if (!cliAliases.has(camp.alias) && camp.status !== 'expired') {
          dbService.updateCamp(camp.id, { status: 'expired' });
        }
      }

      return dbService.listCamps();
    } catch (err) {
      console.error('[CampPool] syncCamps failed:', err);
      return dbService.listCamps();
    }
  }

  // ── Delete camp via CLI ──

  async deleteCamp(alias: string): Promise<void> {
    try {
      await sf(['org', 'delete', 'scratch', '--target-org', alias, '-p', '--json']);
    } catch {
      // May fail if already expired/deleted
    }
    dbService.deleteCampByAlias(alias);
  }

  // ── Open camp URL ──

  async openCamp(alias: string): Promise<string> {
    const settings = getSettings();
    const openPath = settings.campPool?.openPath;
    const args = ['org', 'open', '--target-org', alias, '--url-only', '--json'];
    if (openPath) args.push('--path', openPath);
    const raw = await sf(args);
    const data = parseSfJson(raw);
    return data?.result?.url || '';
  }

  async openDevHub(): Promise<string> {
    try {
      const info = await this.getDevHubInfo();
      const alias = info.devHub?.alias;
      if (!alias) throw new Error('No DevHub found');
      const raw = await sf(['org', 'open', '--target-org', alias, '--url-only', '--json']);
      const data = parseSfJson(raw);
      return data?.result?.url || '';
    } catch (err) {
      console.error('[CampPool] openDevHub failed:', err);
      return '';
    }
  }

  // ── Create camp (scratch org) ──

  async createCamp(alias?: string): Promise<Camp | null> {
    const settings = getSettings();
    const poolSettings = settings.campPool;
    const workingDir = settings.git?.workingDirectory || process.cwd();

    const campAlias = alias || `scratch-${Date.now()}`;
    const defPath = poolSettings?.scratchDefPath || 'config/project-scratch-def.json';
    const duration = poolSettings?.defaultDurationDays || 7;

    broadcast(IPC_CHANNELS.CAMP_PROVISION_OUTPUT, {
      data: `Creating camp "${campAlias}" (${duration} day${duration > 1 ? 's' : ''})...\n`,
    });

    const createCmd = `sf org create scratch --definition-file ${defPath} --alias ${campAlias} --duration-days ${duration} --set-default --json`;
    const result = await runStreamedCommand(createCmd, workingDir);

    if (!result.success) {
      broadcast(IPC_CHANNELS.CAMP_PROVISION_OUTPUT, { data: `\nFailed to create camp.\n` });
      return null;
    }

    let expiresAt: string | undefined;
    let instanceUrl: string | undefined;
    let campId: string | undefined;
    let username: string | undefined;
    try {
      const parsed = parseSfJson(result.stdout);
      expiresAt = parsed?.result?.expirationDate;
      instanceUrl = parsed?.result?.instanceUrl;
      campId = parsed?.result?.orgId;
      username = parsed?.result?.username;
    } catch {
      // Non-JSON output
    }

    broadcast(IPC_CHANNELS.CAMP_PROVISION_OUTPUT, {
      data: `Camp "${campAlias}" created. Generating login URL...\n`,
    });

    let loginUrl: string | undefined;
    try {
      loginUrl = await this.openCamp(campAlias);
    } catch {
      loginUrl = instanceUrl;
    }

    const camp = await this.registerCamp(campAlias, {
      expiresAt, loginUrl, instanceUrl, campId, username,
    });

    broadcast(IPC_CHANNELS.CAMP_PROVISION_OUTPUT, { data: `Done. Camp registered in pool.\n` });
    return camp;
  }

  async discoverCamps(): Promise<Camp[]> {
    return this.syncCamps();
  }

  // ── One-shot: create + deploy + data ──

  async provisionNewCamp(alias?: string): Promise<Camp | null> {
    const settings = getSettings();
    const workingDir = settings.git?.workingDirectory || process.cwd();

    // Step 1: Create the camp
    const camp = await this.createCamp(alias);
    if (!camp) return null;

    const campAlias = camp.alias;

    // Step 2: Deploy source/metadata
    broadcast(IPC_CHANNELS.CAMP_PROVISION_OUTPUT, {
      data: `\nDeploying source to ${campAlias}...\n`,
    });
    const deploy = await runStreamedCommand(
      `sf project deploy start --target-org ${campAlias} --source-dir force-app --ignore-conflicts`,
      workingDir
    );
    if (!deploy.success) {
      broadcast(IPC_CHANNELS.CAMP_PROVISION_OUTPUT, {
        data: `\nSource deploy failed.\n`,
      });
      return camp;
    }

    // Step 3: Load test data (non-fatal)
    const dataPlanPath = settings.campPool?.dataPlanPath;
    if (dataPlanPath) {
      broadcast(IPC_CHANNELS.CAMP_PROVISION_OUTPUT, {
        data: `\nLoading test data...\n`,
      });
      const dataResult = await runStreamedCommand(
        `sf data import tree --target-org ${campAlias} -p ${dataPlanPath}`,
        workingDir
      );
      if (!dataResult.success) {
        broadcast(IPC_CHANNELS.CAMP_PROVISION_OUTPUT, {
          data: `\nWarning: test data load failed, continuing...\n`,
        });
      }
    }

    // Step 4: Assign permission sets (non-fatal)
    const permsets = settings.campPool?.permissionSets;
    if (permsets && permsets.length > 0) {
      broadcast(IPC_CHANNELS.CAMP_PROVISION_OUTPUT, {
        data: `\nAssigning permission sets...\n`,
      });
      for (const ps of permsets) {
        await runStreamedCommand(
          `sf org assign permset --target-org ${campAlias} -n ${ps}`,
          workingDir
        );
      }
    }

    broadcast(IPC_CHANNELS.CAMP_PROVISION_OUTPUT, {
      data: `\nProvisioning complete! Camp "${campAlias}" is ready.\n`,
    });

    return camp;
  }
}

export const campPool = new CampPoolService();
