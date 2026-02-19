import { EventEmitter } from 'events';
import Anthropic from '@anthropic-ai/sdk';
import type { AgentStatus, ChatMessage } from '../../shared/types';
import { getToolDefinitions, executeTool } from './agent-tools';
import type { ToolConfig, ToolCallbacks } from './agent-tools';
import { buildAgentSystemPrompt } from '../prompts/agent-system';
import * as dbService from './database';
import { analytics } from './analytics';
import { v4 as uuid } from 'uuid';

interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string | Anthropic.ContentBlockParam[];
}

export class AgentInstance extends EventEmitter {
  readonly id: string;
  readonly name: string;
  private _status: AgentStatus = 'IDLE';
  private conversationHistory: ConversationMessage[] = [];
  private assignedOrg: string | null = null;
  private assignedBranch: string | null = null;
  private ticketId: string | null = null;
  private runId: string | null = null;
  private anthropic: Anthropic;
  private stopped = false;
  private humanResponseResolve: ((value: string) => void) | null = null;
  private interventionStartTime: number | null = null;

  get status(): AgentStatus { return this._status; }

  constructor(id: string, name: string, apiKey: string) {
    super();
    this.id = id;
    this.name = name;
    this.anthropic = new Anthropic({ apiKey });
  }

  private setStatus(newStatus: AgentStatus): void {
    this._status = newStatus;
    this.emit('status-changed', newStatus);
    dbService.updateAgent(this.id, { status: newStatus });
  }

  private emitChat(role: ChatMessage['role'], content: string): void {
    const msg = dbService.chatSend(this.id, content, role);
    this.emit('chat-message', msg);
  }

  async start(config: {
    ticketId: string;
    orgAlias: string;
    branchName: string;
    prompt: string;
    workingDirectory: string;
  }): Promise<void> {
    this.ticketId = config.ticketId;
    this.assignedOrg = config.orgAlias;
    this.assignedBranch = config.branchName;

    // Create a ticket run in DB
    this.runId = uuid();
    dbService.createRun({
      id: this.runId,
      ticketId: config.ticketId,
      agentId: this.id,
      orgAlias: config.orgAlias,
      branchName: config.branchName,
    });

    this.setStatus('DEVELOPING');
    this.emitChat('system', `Starting work on ticket. Branch: ${config.branchName}, Org: ${config.orgAlias}`);

    const systemPrompt = buildAgentSystemPrompt({
      orgAlias: config.orgAlias,
      branchName: config.branchName,
      projectType: 'salesforce',
    });

    this.conversationHistory = [
      { role: 'user', content: config.prompt },
    ];

    try {
      await this.runAgentLoop(systemPrompt, {
        agentId: this.id,
        orgAlias: config.orgAlias,
        branchName: config.branchName,
        workingDirectory: config.workingDirectory,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      this.setStatus('ERROR');
      this.emitChat('system', `Agent error: ${msg}`);
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

      try {
        dbService.incrementIntervention(this.runId, {
          timestamp: new Date().toISOString(),
          type: 'question',
          agentMessage: '(see chat history)',
          humanResponse: message,
          waitDurationMs,
        });
      } catch {
        // Run might not exist in DB yet — that's ok
      }
    }

    this.emitChat('user', message);

    // If the agent is waiting for input, resume it
    if (this.humanResponseResolve) {
      this.humanResponseResolve(message);
      this.humanResponseResolve = null;
    }
  }

  stop(): void {
    this.stopped = true;
    if (this.runId) {
      dbService.updateRun(this.runId, { status: 'cancelled', completedAt: new Date().toISOString() });
    }
    this.setStatus('IDLE');
    if (this.humanResponseResolve) {
      this.humanResponseResolve('[Agent stopped by user]');
      this.humanResponseResolve = null;
    }
  }

  private async runAgentLoop(
    systemPrompt: string,
    toolConfig: ToolConfig
  ): Promise<void> {
    const tools = getToolDefinitions();

    const toolCallbacks: ToolCallbacks = {
      onTerminalData: (data: string) => {
        this.emit('terminal-data', data);
      },
      onNeedsInput: async (question: string) => {
        this.setStatus('NEEDS_INPUT');
        this.emitChat('agent', question);
        this.emit('needs-input', question);
        this.interventionStartTime = Date.now();

        return new Promise<string>((resolve) => {
          this.humanResponseResolve = resolve;
        });
      },
      onWorkComplete: () => {
        this.setStatus('QA_READY');
        this.emitChat('system', 'Development complete. Ready for QA review.');
        if (this.runId) {
          dbService.updateRun(this.runId, { status: 'completed', completedAt: new Date().toISOString() });
        }
        this.emit('work-complete');
      },
    };

    while (!this.stopped) {
      const response = await this.anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 8192,
        system: systemPrompt,
        tools: tools as Anthropic.Tool[],
        messages: this.conversationHistory as Anthropic.MessageParam[],
      });

      // Record token usage
      if (this.runId) {
        analytics.recordTokenUsage(
          this.runId,
          response.usage.input_tokens,
          response.usage.output_tokens
        );
      }

      const assistantContent: Anthropic.ContentBlockParam[] = [];
      const toolResults: Anthropic.ToolResultBlockParam[] = [];

      for (const block of response.content) {
        if (block.type === 'text') {
          assistantContent.push({ type: 'text', text: block.text });
          this.emitChat('agent', block.text);
        } else if (block.type === 'tool_use') {
          assistantContent.push({
            type: 'tool_use',
            id: block.id,
            name: block.name,
            input: block.input as Record<string, string>,
          });

          const result = await executeTool(
            block.name,
            block.input as Record<string, string>,
            toolConfig,
            toolCallbacks
          );

          if (block.name === 'report_development_complete' || this.stopped) {
            toolResults.push({
              type: 'tool_result',
              tool_use_id: block.id,
              content: result.output,
            });
            break;
          }

          if (block.name === 'request_human_input') {
            this.setStatus('DEVELOPING');
          }

          toolResults.push({
            type: 'tool_result',
            tool_use_id: block.id,
            content: result.error
              ? `Error: ${result.error}\n${result.output}`
              : result.output,
          });
        }
      }

      this.conversationHistory.push({
        role: 'assistant',
        content: assistantContent,
      });

      if (toolResults.length > 0) {
        this.conversationHistory.push({
          role: 'user',
          content: toolResults as unknown as Anthropic.ContentBlockParam[],
        });
      }

      if (this._status === 'QA_READY' || this.stopped) {
        break;
      }

      if (response.stop_reason === 'end_turn' && toolResults.length === 0) {
        break;
      }
    }
  }
}
