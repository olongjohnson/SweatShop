import * as fs from 'fs';
import * as path from 'path';

export interface DeathmarkFieldMapping {
  title: string;
  description: string;
  acceptanceCriteria: string;
  priority: string;
  status: string;
  labels: string;
}

export interface DeathmarkConfig {
  instanceUrl: string;
  accessToken?: string;
  refreshToken?: string;
  clientId?: string;
  clientSecret?: string;
  objectName: string;
  fieldMapping: DeathmarkFieldMapping;
}

export interface SweatShopSettings {
  anthropicApiKey?: string;
  deathmark?: DeathmarkConfig;
  git?: {
    baseBranch: string;
    mergeStrategy: 'squash' | 'merge';
    workingDirectory: string;
  };
  campPool?: {
    maxCamps: number;
    scratchDefPath: string;
    defaultDurationDays: number;
    dataPlanPath?: string;
    permissionSets?: string[];
    openPath?: string;
    allowSharedCamps?: boolean;
    maxConscriptsPerCamp?: number;
  };
}

const DEFAULTS: SweatShopSettings = {
  git: {
    baseBranch: 'main',
    mergeStrategy: 'squash',
    workingDirectory: '',
  },
  campPool: {
    maxCamps: 4,
    scratchDefPath: 'config/project-scratch-def.json',
    defaultDurationDays: 7,
    allowSharedCamps: true,
    maxConscriptsPerCamp: 3,
  },
};

let settingsPath: string;
let settings: SweatShopSettings;

export function initSettings(userDataPath: string): void {
  settingsPath = path.join(userDataPath, 'settings.json');

  if (fs.existsSync(settingsPath)) {
    try {
      const raw = fs.readFileSync(settingsPath, 'utf-8');
      settings = { ...DEFAULTS, ...JSON.parse(raw) };
    } catch {
      settings = { ...DEFAULTS };
    }
  } else {
    settings = { ...DEFAULTS };
    saveSettings();
  }

  // Propagate stored API key to env var for the Claude Agent SDK
  if (settings.anthropicApiKey && !process.env.ANTHROPIC_API_KEY) {
    process.env.ANTHROPIC_API_KEY = settings.anthropicApiKey;
  }
}

function saveSettings(): void {
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf-8');
}

export function getSettings(): SweatShopSettings {
  return { ...settings };
}

export function updateSettings(data: Partial<SweatShopSettings>): SweatShopSettings {
  settings = { ...settings, ...data };
  saveSettings();
  return { ...settings };
}
