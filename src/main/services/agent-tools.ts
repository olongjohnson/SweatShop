import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { validateShellCommand, validateFileWrite } from './agent-guardrails';

export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, unknown>;
    required: string[];
  };
}

export interface ToolConfig {
  agentId: string;
  orgAlias: string;
  branchName: string;
  workingDirectory: string;
}

export interface ToolResult {
  output: string;
  error?: string;
}

// Callback types for agent events
export interface ToolCallbacks {
  onTerminalData: (data: string) => void;
  onNeedsInput: (question: string) => Promise<string>;
  onWorkComplete: () => void;
}

export function getToolDefinitions(): ToolDefinition[] {
  return [
    {
      name: 'shell_exec',
      description: 'Execute a shell command in the project directory. For Salesforce CLI commands, the target org is pre-configured — do not specify -o or --target-org flags.',
      input_schema: {
        type: 'object',
        properties: {
          command: { type: 'string', description: 'The shell command to execute' },
        },
        required: ['command'],
      },
    },
    {
      name: 'file_read',
      description: 'Read the contents of a file at the given path (relative to project root).',
      input_schema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'File path relative to project root' },
        },
        required: ['path'],
      },
    },
    {
      name: 'file_write',
      description: 'Write content to a file at the given path. Creates directories if needed.',
      input_schema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'File path relative to project root' },
          content: { type: 'string', description: 'The content to write to the file' },
        },
        required: ['path', 'content'],
      },
    },
    {
      name: 'file_edit',
      description: 'Replace a specific string in a file with new content.',
      input_schema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'File path relative to project root' },
          old_string: { type: 'string', description: 'The exact string to find and replace' },
          new_string: { type: 'string', description: 'The replacement string' },
        },
        required: ['path', 'old_string', 'new_string'],
      },
    },
    {
      name: 'request_human_input',
      description: 'Ask the human a question. Use this when you need clarification, a decision, or approval. The agent will pause until the human responds.',
      input_schema: {
        type: 'object',
        properties: {
          question: { type: 'string', description: 'The question to ask the human' },
        },
        required: ['question'],
      },
    },
    {
      name: 'report_development_complete',
      description: 'Signal that development is complete and the code is ready for deployment and QA. This triggers the provisioning pipeline.',
      input_schema: {
        type: 'object',
        properties: {
          summary: { type: 'string', description: 'Brief summary of what was implemented' },
        },
        required: ['summary'],
      },
    },
  ];
}

export async function executeTool(
  toolName: string,
  toolInput: Record<string, string>,
  config: ToolConfig,
  callbacks: ToolCallbacks
): Promise<ToolResult> {
  switch (toolName) {
    case 'shell_exec':
      return executeShell(toolInput.command, config, callbacks);
    case 'file_read':
      return executeFileRead(toolInput.path, config);
    case 'file_write':
      return executeFileWrite(toolInput.path, toolInput.content, config);
    case 'file_edit':
      return executeFileEdit(toolInput.path, toolInput.old_string, toolInput.new_string, config);
    case 'request_human_input':
      return executeRequestHumanInput(toolInput.question, callbacks);
    case 'report_development_complete':
      callbacks.onWorkComplete();
      return { output: `Development complete. Summary: ${toolInput.summary}` };
    default:
      return { output: '', error: `Unknown tool: ${toolName}` };
  }
}

async function executeShell(
  command: string,
  config: ToolConfig,
  callbacks: ToolCallbacks
): Promise<ToolResult> {
  const validation = validateShellCommand(command, {
    orgAlias: config.orgAlias,
    branchName: config.branchName,
  });

  if (!validation.allowed) {
    return { output: '', error: `BLOCKED: ${validation.reason}` };
  }

  const finalCommand = validation.modified || command;
  callbacks.onTerminalData(`$ ${finalCommand}\n`);

  return new Promise((resolve) => {
    const child = exec(finalCommand, {
      cwd: config.workingDirectory,
      timeout: 300000, // 5 min timeout
      maxBuffer: 1024 * 1024 * 10,
    });

    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', (data: string) => {
      stdout += data;
      callbacks.onTerminalData(data);
    });

    child.stderr?.on('data', (data: string) => {
      stderr += data;
      callbacks.onTerminalData(data);
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve({ output: stdout || '(no output)' });
      } else {
        resolve({ output: stdout, error: `Exit code ${code}: ${stderr}` });
      }
    });

    child.on('error', (err) => {
      resolve({ output: '', error: err.message });
    });
  });
}

function executeFileRead(
  filePath: string,
  config: ToolConfig
): ToolResult {
  const resolved = path.resolve(config.workingDirectory, filePath);
  const relative = path.relative(config.workingDirectory, resolved);

  if (relative.startsWith('..')) {
    return { output: '', error: 'Cannot read files outside project directory' };
  }

  try {
    const content = fs.readFileSync(resolved, 'utf-8');
    return { output: content };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return { output: '', error: msg };
  }
}

function executeFileWrite(
  filePath: string,
  content: string,
  config: ToolConfig
): ToolResult {
  const validation = validateFileWrite(filePath, config.workingDirectory);
  if (!validation.allowed) {
    return { output: '', error: `BLOCKED: ${validation.reason}` };
  }

  const resolved = path.resolve(config.workingDirectory, filePath);

  try {
    fs.mkdirSync(path.dirname(resolved), { recursive: true });
    fs.writeFileSync(resolved, content, 'utf-8');
    return { output: `Written to ${filePath}` };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return { output: '', error: msg };
  }
}

function executeFileEdit(
  filePath: string,
  oldString: string,
  newString: string,
  config: ToolConfig
): ToolResult {
  const validation = validateFileWrite(filePath, config.workingDirectory);
  if (!validation.allowed) {
    return { output: '', error: `BLOCKED: ${validation.reason}` };
  }

  const resolved = path.resolve(config.workingDirectory, filePath);

  try {
    const content = fs.readFileSync(resolved, 'utf-8');
    if (!content.includes(oldString)) {
      return { output: '', error: 'old_string not found in file' };
    }
    const updated = content.replace(oldString, newString);
    fs.writeFileSync(resolved, updated, 'utf-8');
    return { output: `Edited ${filePath}` };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return { output: '', error: msg };
  }
}

async function executeRequestHumanInput(
  question: string,
  callbacks: ToolCallbacks
): Promise<ToolResult> {
  const response = await callbacks.onNeedsInput(question);
  return { output: `Human response: ${response}` };
}
