import * as path from 'path';

interface ShellValidation {
  allowed: boolean;
  modified?: string;
  reason?: string;
}

interface FileValidation {
  allowed: boolean;
  reason?: string;
}

const BLOCKED_PATTERNS = [
  { pattern: /rm\s+-rf\s+\//, reason: 'Recursive delete of root is blocked' },
  { pattern: /git\s+push\s+--force/, reason: 'Force push is blocked' },
  { pattern: /git\s+push\s+-f\b/, reason: 'Force push is blocked' },
  { pattern: /sf\s+org\s+delete/, reason: 'Agents cannot delete orgs' },
  { pattern: /sf\s+org\s+create/, reason: 'Agents cannot create orgs — the controller does this' },
  { pattern: /format\s+[a-zA-Z]:/, reason: 'Disk formatting is blocked' },
  { pattern: /shutdown\s/, reason: 'System shutdown is blocked' },
  { pattern: /reboot\b/, reason: 'System reboot is blocked' },
  { pattern: /mkfs\./, reason: 'Filesystem creation is blocked' },
  { pattern: /dd\s+if=/, reason: 'Raw disk writes are blocked' },
];

export function validateShellCommand(
  command: string,
  config: { orgAlias: string; branchName: string }
): ShellValidation {
  // Check blocked patterns
  for (const { pattern, reason } of BLOCKED_PATTERNS) {
    if (pattern.test(command)) {
      return { allowed: false, reason };
    }
  }

  let modified = command;

  // Inject --target-org for sf commands that don't already have it
  if (/^\s*sf\s/.test(modified) && !/--target-org\b|-o\s/.test(modified)) {
    // Don't inject for commands that don't take an org flag
    const orgCommands = /sf\s+(project\s+deploy|project\s+retrieve|apex\s+run|apex\s+test|data\s+|org\s+open|org\s+display)/;
    if (orgCommands.test(modified)) {
      modified = modified.trimEnd() + ` --target-org ${config.orgAlias}`;
    }
  }

  return { allowed: true, modified };
}

export function validateFileWrite(
  filePath: string,
  workingDirectory: string
): FileValidation {
  const resolved = path.resolve(workingDirectory, filePath);
  const relative = path.relative(workingDirectory, resolved);

  // Block writes outside project directory
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    return { allowed: false, reason: 'Cannot write outside project directory' };
  }

  // Block writes to .git directory
  if (relative.startsWith('.git') || relative.includes('/.git/') || relative.includes('\\.git\\')) {
    return { allowed: false, reason: 'Cannot write to .git directory' };
  }

  // Block writes to node_modules
  if (relative.startsWith('node_modules') || relative.includes('/node_modules/') || relative.includes('\\node_modules\\')) {
    return { allowed: false, reason: 'Cannot write to node_modules' };
  }

  // Block credential files
  const blockedFiles = ['.env', '.env.local', '.env.production', 'credentials.json', '.npmrc'];
  const basename = path.basename(resolved);
  if (blockedFiles.includes(basename)) {
    return { allowed: false, reason: `Cannot write to ${basename} (credential file)` };
  }

  return { allowed: true };
}
