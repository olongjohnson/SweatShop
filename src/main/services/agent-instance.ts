import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';
import type {
  Query,
  SDKResultSuccess,
  SDKResultError,
  HookCallbackMatcher,
  HookInput,
  HookJSONOutput,
} from '@anthropic-ai/claude-agent-sdk';
import type { ConscriptStatus, ChatMessage } from '../../shared/types';
import { buildConscriptSystemPrompt } from '../prompts/agent-system';
import * as dbService from './database';
import * as writeback from './deathmark-writeback';
import { analytics } from './analytics';
import { generateQaChecklist } from './qa-checklist-generator';
import { GitService } from './git-service';
import { getSettings } from './settings';
import { randomUUID } from 'crypto';

// Debug file logger
const LOG_FILE = path.join(process.env.USERPROFILE || process.env.HOME || '.', 'sweatshop-conscript.log');
function debugLog(msg: string): void {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  fs.appendFileSync(LOG_FILE, line);
  console.log(msg);
}

// Lazy-loaded ESM modules — use Function trick to prevent tsc from
// compiling dynamic import() into require() (which breaks ESM-only packages)
// eslint-disable-next-line @typescript-eslint/no-implied-eval
const dynamicImport = new Function('specifier', 'return import(specifier)') as (specifier: string) => Promise<any>;

let _sdk: any = null;
async function getSDK(): Promise<typeof import('@anthropic-ai/claude-agent-sdk')> {
  if (!_sdk) {
    _sdk = await dynamicImport('@anthropic-ai/claude-agent-sdk');
  }
  return _sdk;
}

let _zod: any = null;
async function getZod(): Promise<typeof import('zod/v4')> {
  if (!_zod) {
    _zod = await dynamicImport('zod/v4');
  }
  return _zod;
}

// Blocked shell patterns (ported from conscript-guardrails.ts)
const BLOCKED_PATTERNS = [
  { pattern: /rm\s+-rf\s+\//, reason: 'Recursive delete of root is blocked' },
  { pattern: /git\s+push/, reason: 'Conscripts cannot push — merging is handled by the controller' },
  { pattern: /git\s+merge/, reason: 'Conscripts cannot merge — merging is handled by the controller' },
  { pattern: /git\s+checkout\s+(main|master)\b/, reason: 'Conscripts cannot checkout main/master' },
  { pattern: /git\s+switch\s+(main|master)\b/, reason: 'Conscripts cannot switch to main/master' },
  { pattern: /git\s+rebase/, reason: 'Conscripts cannot rebase' },
  { pattern: /git\s+reset\s+--hard/, reason: 'Hard reset is blocked' },
  { pattern: /sf\s+org\s+delete/, reason: 'Conscripts cannot delete camps' },
  { pattern: /sf\s+org\s+create/, reason: 'Conscripts cannot create camps — the controller does this' },
  { pattern: /format\s+[a-zA-Z]:/, reason: 'Disk formatting is blocked' },
  { pattern: /shutdown\s/, reason: 'System shutdown is blocked' },
  { pattern: /reboot\b/, reason: 'System reboot is blocked' },
  { pattern: /mkfs\./, reason: 'Filesystem creation is blocked' },
  { pattern: /dd\s+if=/, reason: 'Raw disk writes are blocked' },
];

export class ConscriptInstance extends EventEmitter {
  readonly id: string;
  readonly name: string;
  private _status: ConscriptStatus = 'IDLE';
  private runId: string | null = null;
  private sessionId: string | null = null;
  private abortController: AbortController | null = null;
  private stopped = false;
  private humanResponseResolve: ((value: string) => void) | null = null;
  private interventionStartTime: number | null = null;

  get status(): ConscriptStatus { return this._status; }

  constructor(id: string, name: string) {
    super();
    this.id = id;
    this.name = name;
  }

  private setStatus(newStatus: ConscriptStatus): void {
    this._status = newStatus;
    this.emit('status-changed', newStatus);
    dbService.updateConscript(this.id, { status: newStatus });
  }

  private emitChat(role: ChatMessage['role'], content: string): void {
    const msg = dbService.chatSend(this.id, content, role);
    this.emit('chat-message', msg);
  }

  /** Generate QA checklist and save to DB before transitioning to QA_READY */
  private async generateQaChecklistBeforeQA(): Promise<void> {
    try {
      const conscript = dbService.getConscript(this.id);
      if (!conscript?.assignedDirectiveId || !conscript.branchName) return;

      const directive = dbService.getDirective(conscript.assignedDirectiveId);
      if (!directive) return;

      const settings = getSettings();
      const projectDir = settings.git?.workingDirectory || process.cwd();
      const gitService = new GitService(projectDir);

      const [diffSummary, commitLog] = await Promise.all([
        gitService.getFullDiff(conscript.branchName).catch(() => '(diff unavailable)'),
        gitService.getCommitLog(conscript.branchName).then((commits) =>
          commits.map((c) => `${c.shortHash} ${c.subject}`).join('\n')
        ).catch(() => ''),
      ]);

      debugLog(`[ConscriptInstance ${this.id}] Generating QA checklist...`);
      const items = await generateQaChecklist({ directive, diffSummary, commitLog });
      dbService.updateQaChecklist(this.id, items);
      debugLog(`[ConscriptInstance ${this.id}] QA checklist ready: ${items.length} items`);
    } catch (err) {
      debugLog(`[ConscriptInstance ${this.id}] QA checklist generation failed: ${err}`);
      // Non-fatal — proceed to QA_READY without checklist
    }
  }

  async start(config: {
    directiveId: string;
    campAlias: string;
    branchName: string;
    prompt: string;
    workingDirectory: string;
    identity?: {
      systemPrompt?: string;
      model?: 'sonnet' | 'opus' | 'haiku';
      maxTurns?: number;
      maxBudgetUsd?: number;
      allowedTools?: string[];
      disallowedTools?: string[];
    };
  }): Promise<void> {
    debugLog(`[ConscriptInstance ${this.id}] start() called`);
    debugLog(`[ConscriptInstance ${this.id}] CLAUDECODE env = ${process.env.CLAUDECODE || 'NOT SET'}`);
    debugLog(`[ConscriptInstance ${this.id}] ANTHROPIC_API_KEY set = ${!!process.env.ANTHROPIC_API_KEY}`);
    this.stopped = false;

    // Create a directive run in DB
    this.runId = randomUUID();
    dbService.createRun({
      id: this.runId,
      directiveId: config.directiveId,
      conscriptId: this.id,
      campAlias: config.campAlias,
      branchName: config.branchName,
    });

    this.setStatus('DEVELOPING');
    this.emitChat('system', `Starting work on directive. Branch: ${config.branchName}, Camp: ${config.campAlias}`);

    const envPrompt = buildConscriptSystemPrompt({
      campAlias: config.campAlias,
      branchName: config.branchName,
      projectType: 'salesforce',
    });

    // If identity provides a system prompt, prepend it before environment context
    const systemPrompt = config.identity?.systemPrompt
      ? `${config.identity.systemPrompt}\n\n${envPrompt}`
      : envPrompt;

    // Build allowed tools: merge identity overrides with base + MCP tools
    const baseTools = [
      'Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep',
      'mcp__sweatshop__request_human_input',
      'mcp__sweatshop__report_development_complete',
    ];
    let allowedTools = baseTools;
    if (config.identity?.allowedTools?.length) {
      // Merge: identity tools + always-included MCP tools
      const mcpTools = baseTools.filter((t) => t.startsWith('mcp__'));
      allowedTools = [...new Set([...config.identity.allowedTools, ...mcpTools])];
    }
    if (config.identity?.disallowedTools?.length) {
      allowedTools = allowedTools.filter((t) => !config.identity!.disallowedTools!.includes(t));
    }

    this.abortController = new AbortController();

    // Dynamic import of ESM SDK
    debugLog(`[ConscriptInstance ${this.id}] Loading SDK...`);
    const { query } = await getSDK();
    debugLog(`[ConscriptInstance ${this.id}] SDK loaded`);

    // Create custom MCP server with app-specific tools
    const mcpServer = await this.createMcpServer();
    debugLog(`[ConscriptInstance ${this.id}] MCP server created`);

    // Build query options with identity overrides
    const queryOptions: Record<string, unknown> = {
      systemPrompt,
      cwd: config.workingDirectory,
      abortController: this.abortController,
      permissionMode: 'bypassPermissions',
      allowDangerouslySkipPermissions: true,
      allowedTools,
      mcpServers: {
        sweatshop: mcpServer,
      },
      hooks: {
        PreToolUse: [
          this.createBashGuardHook(config.campAlias),
        ],
        PostToolUse: [
          this.createTerminalOutputHook(),
        ],
      },
      settingSources: [],
      persistSession: false,
    };

    // Apply identity model/budget/turn overrides
    if (config.identity?.maxTurns) queryOptions.maxTurns = config.identity.maxTurns;
    if (config.identity?.maxBudgetUsd) queryOptions.maxCostUsd = config.identity.maxBudgetUsd;
    if (config.identity?.model) queryOptions.model = config.identity.model;

    try {
      debugLog(`[ConscriptInstance ${this.id}] Starting query() with cwd=${config.workingDirectory}`);
      debugLog(`[ConscriptInstance ${this.id}] Prompt: ${config.prompt.slice(0, 200)}...`);
      const q = query({
        prompt: config.prompt,
        options: queryOptions as any,
      });

      debugLog(`[ConscriptInstance ${this.id}] query() returned, iterating message stream...`);
      await this.processMessageStream(q);
      debugLog(`[ConscriptInstance ${this.id}] Message stream completed, status=${this._status}`);

      // If conscript finished without calling report_development_complete, auto-transition to QA_READY
      if (this._status === 'DEVELOPING' || this._status === 'REWORK') {
        debugLog(`[ConscriptInstance ${this.id}] Conscript completed without reporting — auto-transitioning to QA_READY`);
        if (this.runId) {
          dbService.updateRun(this.runId, { status: 'completed', completedAt: new Date().toISOString() });
        }
        // Generate QA checklist before transitioning so it's ready when UI loads
        await this.generateQaChecklistBeforeQA();
        this.setStatus('QA_READY');
        this.emitChat('system', 'Conscript finished working. Ready for review.');
        this.emit('work-complete');
      }
    } catch (err: unknown) {
      if (this.stopped) return; // Expected abort
      debugLog(`[ConscriptInstance ${this.id}] Error: ${err}`);
      const msg = err instanceof Error ? err.message : 'Unknown error';
      const stack = err instanceof Error ? err.stack : '';
      this.setStatus('ERROR');
      this.emitChat('system', `Conscript error: ${msg}`);
      if (stack) debugLog(`[ConscriptInstance ${this.id}] Stack: ${stack}`);
      if (this.runId) {
        dbService.updateRun(this.runId, { status: 'failed', completedAt: new Date().toISOString() });
      }
      this.emit('error', err);
    }
  }

  async handleHumanMessage(message: string): Promise<void> {
    // Record intervention wait time
    if (this.interventionStartTime && this.runId) {
      const waitDurationMs = Date.now() - this.interventionStartTime;
      this.interventionStartTime = null;

      const interventionEvent = {
        timestamp: new Date().toISOString(),
        type: 'question' as const,
        conscriptMessage: '(see chat history)',
        humanResponse: message,
        waitDurationMs,
      };

      try {
        dbService.incrementIntervention(this.runId, interventionEvent);
        const run = dbService.getRun(this.runId);
        if (run) {
          writeback.onIntervention(this.runId, interventionEvent, run.humanInterventionCount - 1).catch(() => {});
        }
      } catch {
        // Run might not exist in DB yet — that's ok
      }
    }

    this.emitChat('user', message);

    // If the conscript is waiting for input, resume it
    if (this.humanResponseResolve) {
      this.humanResponseResolve(message);
      this.humanResponseResolve = null;
    }
  }

  stop(): void {
    this.stopped = true;
    if (this.abortController) {
      this.abortController.abort();
    }
    if (this.runId) {
      dbService.updateRun(this.runId, { status: 'cancelled', completedAt: new Date().toISOString() });
    }
    this.setStatus('IDLE');
    if (this.humanResponseResolve) {
      this.humanResponseResolve('[Conscript stopped by user]');
      this.humanResponseResolve = null;
    }
  }

  private async createMcpServer() {
    const { createSdkMcpServer, tool } = await getSDK();
    const { z } = await getZod();

    return createSdkMcpServer({
      name: 'sweatshop',
      version: '1.0.0',
      tools: [
        tool(
          'request_human_input',
          'Ask the human a question. Use this when you need clarification, a decision, or approval. The conscript will pause until the human responds.',
          { question: z.string().describe('The question to ask the human') },
          async (args) => {
            this.setStatus('NEEDS_INPUT');
            this.emitChat('conscript', args.question);
            this.emit('needs-input', args.question);
            this.interventionStartTime = Date.now();

            const response = await new Promise<string>((resolve) => {
              this.humanResponseResolve = resolve;
            });

            this.setStatus('DEVELOPING');
            return {
              content: [{ type: 'text' as const, text: `Human response: ${response}` }],
            };
          }
        ),
        tool(
          'report_development_complete',
          'Signal that development is complete and the code is ready for deployment and QA. Call this when all implementation and local commits are done.',
          { summary: z.string().describe('Brief summary of what was implemented') },
          async (args) => {
            if (this.runId) {
              dbService.updateRun(this.runId, { status: 'completed', completedAt: new Date().toISOString() });
            }
            // Generate QA checklist before transitioning so it's ready when UI loads
            await this.generateQaChecklistBeforeQA();
            this.setStatus('QA_READY');
            this.emitChat('system', `Development complete: ${args.summary}`);
            this.emit('work-complete');
            return {
              content: [{ type: 'text' as const, text: `Development complete. Summary: ${args.summary}` }],
            };
          }
        ),
      ],
    });
  }

  private createBashGuardHook(campAlias: string): HookCallbackMatcher {
    return {
      matcher: 'Bash',
      hooks: [
        async (input: HookInput, _toolUseId: string | undefined, _options: { signal: AbortSignal }): Promise<HookJSONOutput> => {
          const toolInput = (input as { tool_input?: unknown }).tool_input as { command?: string } | undefined;
          const command = toolInput?.command || '';

          // Check blocked patterns
          for (const { pattern, reason } of BLOCKED_PATTERNS) {
            if (pattern.test(command)) {
              return {
                hookSpecificOutput: {
                  hookEventName: 'PreToolUse' as const,
                  permissionDecision: 'deny' as const,
                  permissionDecisionReason: `BLOCKED: ${reason}`,
                },
              };
            }
          }

          // Auto-inject --target-org for sf commands
          if (/^\s*sf\s/.test(command) && !/--target-org\b|-o\s/.test(command)) {
            const campCommands = /sf\s+(project\s+deploy|project\s+retrieve|apex\s+run|apex\s+test|data\s+|org\s+open|org\s+display)/;
            if (campCommands.test(command)) {
              const modified = command.trimEnd() + ` --target-org ${campAlias}`;
              return {
                hookSpecificOutput: {
                  hookEventName: 'PreToolUse' as const,
                  permissionDecision: 'allow' as const,
                  updatedInput: { command: modified },
                },
              };
            }
          }

          return { continue: true };
        },
      ],
    };
  }

  private createTerminalOutputHook(): HookCallbackMatcher {
    return {
      matcher: 'Bash',
      hooks: [
        async (input: HookInput, _toolUseId: string | undefined, _options: { signal: AbortSignal }): Promise<HookJSONOutput> => {
          const toolInput = (input as { tool_input?: unknown }).tool_input as { command?: string } | undefined;
          const toolResponse = (input as { tool_response?: unknown }).tool_response as { stdout?: string; stderr?: string; output?: string } | undefined;

          if (toolInput?.command) {
            this.emit('terminal-data', `$ ${toolInput.command}\n`);
          }
          const output = toolResponse?.stdout || toolResponse?.output || '';
          const stderr = toolResponse?.stderr || '';
          if (output) this.emit('terminal-data', output);
          if (stderr) this.emit('terminal-data', stderr);

          return { continue: true };
        },
      ],
    };
  }

  private async processMessageStream(q: Query): Promise<void> {
    debugLog(`[ConscriptInstance ${this.id}] Entering message stream loop`);
    for await (const message of q) {
      debugLog(`[ConscriptInstance ${this.id}] Message: type=${message.type}, subtype=${'subtype' in message ? (message as { subtype?: string }).subtype : 'n/a'}`);
      if (this.stopped) break;

      switch (message.type) {
        case 'system':
          if ('subtype' in message && message.subtype === 'init') {
            this.sessionId = message.session_id;
            debugLog(`[ConscriptInstance ${this.id}] Session initialized: ${message.session_id}`);
          }
          break;

        case 'assistant': {
          // Extract text content from assistant messages
          const content = message.message?.content;
          if (Array.isArray(content)) {
            for (const block of content) {
              if (block.type === 'text' && 'text' in block && block.text) {
                this.emitChat('conscript', block.text);
              }
            }
          }
          break;
        }

        case 'result': {
          const result = message as SDKResultSuccess | SDKResultError;
          // Record token usage
          if (this.runId && result.usage) {
            analytics.recordTokenUsage(
              this.runId,
              result.usage.input_tokens ?? 0,
              result.usage.output_tokens ?? 0,
            );
          }

          if (result.subtype !== 'success') {
            const errorResult = result as SDKResultError;
            if (errorResult.errors?.length && !this.stopped) {
              this.setStatus('ERROR');
              this.emitChat('system', `Conscript error: ${errorResult.errors.join(', ')}`);
              if (this.runId) {
                dbService.updateRun(this.runId, { status: 'failed', completedAt: new Date().toISOString() });
              }
            }
          }
          break;
        }
      }
    }
  }
}
