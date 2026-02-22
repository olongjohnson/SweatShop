/* eslint-disable @typescript-eslint/no-var-requires */
import { getSettings } from './settings';
import type { Directive } from '../../shared/types';

// jsforce v3 — use require for CJS compat
const jsforce = require('jsforce');

export type JsforceConnection = {
  identity(): Promise<unknown>;
  query<T>(soql: string): Promise<{ records: T[] }>;
  sobject(name: string): {
    update(data: Record<string, unknown>): Promise<unknown>;
    upsert(data: Record<string, unknown>, extIdField: string): Promise<{ id: string; success: boolean }>;
    create(data: Record<string, unknown>): Promise<{ id: string; success: boolean }>;
  };
};

let conn: JsforceConnection | null = null;

export async function connect(): Promise<void> {
  const settings = getSettings();
  const config = settings.deathmark;

  if (!config?.instanceUrl) {
    throw new Error('Deathmark not configured. Set instanceUrl in Settings.');
  }

  const connOpts: Record<string, unknown> = {
    instanceUrl: config.instanceUrl,
    accessToken: config.accessToken,
  };

  if (config.refreshToken && config.clientId && config.clientSecret) {
    connOpts.oauth2 = {
      clientId: config.clientId,
      clientSecret: config.clientSecret,
    };
    connOpts.refreshToken = config.refreshToken;
    delete connOpts.accessToken;
  }

  conn = new jsforce.Connection(connOpts) as JsforceConnection;
}

export async function ensureConnection(): Promise<JsforceConnection> {
  if (!conn) await connect();
  return conn!;
}

export async function testConnection(): Promise<{ success: boolean; error?: string }> {
  try {
    if (!conn) await connect();
    await conn!.identity();
    return { success: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return { success: false, error: message };
  }
}

export async function fetchDirectives(options?: {
  status?: string;
  sprint?: string;
  limit?: number;
}): Promise<Partial<Directive>[]> {
  if (!conn) await connect();

  const settings = getSettings();
  const config = settings.deathmark;
  if (!config) throw new Error('Deathmark not configured');

  const objectName = config.objectName || 'Directive__c';
  const fm = config.fieldMapping;

  const fields = [
    'Id',
    fm.title,
    fm.description,
    fm.acceptanceCriteria,
    fm.priority,
    fm.status,
    fm.labels,
  ].filter(Boolean);

  let query = `SELECT ${fields.join(', ')} FROM ${objectName}`;
  const conditions: string[] = [];

  if (options?.status) {
    conditions.push(`${fm.status} = '${options.status}'`);
  }

  if (conditions.length > 0) {
    query += ` WHERE ${conditions.join(' AND ')}`;
  }

  query += ` ORDER BY CreatedDate DESC`;

  if (options?.limit) {
    query += ` LIMIT ${options.limit}`;
  }

  const result = await conn!.query<Record<string, unknown>>(query);

  return (result.records || []).map((rec: Record<string, unknown>) => ({
    externalId: rec.Id as string,
    source: 'deathmark' as const,
    title: (rec[fm.title] as string) || '',
    description: (rec[fm.description] as string) || '',
    acceptanceCriteria: (rec[fm.acceptanceCriteria] as string) || '',
    priority: mapPriority(rec[fm.priority] as string),
    status: 'backlog' as const,
    labels: parseLabels(rec[fm.labels] as string),
    dependsOn: [],
  }));
}

export async function updateDirectiveStatus(externalId: string, status: string): Promise<void> {
  if (!conn) await connect();

  const settings = getSettings();
  const config = settings.deathmark;
  if (!config) throw new Error('Deathmark not configured');

  const objectName = config.objectName || 'Directive__c';

  await conn!.sobject(objectName).update({
    Id: externalId,
    [config.fieldMapping.status]: status,
  });
}

function mapPriority(value: string | undefined): 'low' | 'medium' | 'high' | 'critical' {
  if (!value) return 'medium';
  const lower = value.toLowerCase();
  if (lower.includes('critical') || lower.includes('urgent')) return 'critical';
  if (lower.includes('high')) return 'high';
  if (lower.includes('low')) return 'low';
  return 'medium';
}

function parseLabels(value: string | undefined): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return value.split(/[,;]/).map((s: string) => s.trim()).filter(Boolean);
  }
}
