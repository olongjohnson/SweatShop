import { execFile } from 'child_process';
import * as dbService from './database';
import { getSettings } from './settings';
import type { ScratchOrg } from '../../shared/types';

function sf(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile('sf', args, { timeout: 120000, maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) reject(new Error(stderr || err.message));
      else resolve(stdout.trim());
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
