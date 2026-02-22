import { EventEmitter } from 'events';
import { BrowserWindow } from 'electron';
import type { SDKResultSuccess } from '@anthropic-ai/claude-agent-sdk';
import type {
  Directive, WorkflowTemplate, WorkflowStage,
  PipelineRun, PipelineStageOutput, IdentityTemplate,
} from '../../shared/types';
import { IPC_CHANNELS } from '../../shared/ipc-channels';
import * as dbService from './database';
import { conscriptManager } from './agent-manager';
import { getSettings } from './settings';

// eslint-disable-next-line @typescript-eslint/no-implied-eval
const dynamicImport = new Function('specifier', 'return import(specifier)') as (specifier: string) => Promise<any>;

let _sdk: any = null;
async function getSDK(): Promise<typeof import('@anthropic-ai/claude-agent-sdk')> {
  if (!_sdk) {
    _sdk = await dynamicImport('@anthropic-ai/claude-agent-sdk');
  }
  return _sdk;
}

class PipelineExecutorService extends EventEmitter {
  private humanResolvers = new Map<string, (input: string) => void>();

  /**
   * Execute a directive through a workflow pipeline.
   */
  async execute(
    directive: Directive,
    workflow: WorkflowTemplate,
    conscriptId: string,
    workingDirectory: string,
  ): Promise<void> {
    const pipelineRun = dbService.createPipelineRun({
      directiveId: directive.id,
      workflowTemplateId: workflow.id,
    });

    const stages = [...workflow.stages].sort((a, b) => a.order - b.order);
    const stageOutputs: PipelineStageOutput[] = [];

    console.log(`[Pipeline] Starting pipeline "${workflow.name}" for directive "${directive.title}" (${stages.length} stages)`);

    try {
      for (let i = 0; i < stages.length; i++) {
        const stage = stages[i];

        dbService.updatePipelineRun(pipelineRun.id, {
          currentStageIndex: i,
          stageOutputs,
        });

        const identity = stage.identityTemplateId
          ? dbService.getIdentityTemplate(stage.identityTemplateId)
          : null;
        const identityName = identity?.name || (stage.type === 'human' ? 'Human' : 'Unknown');

        console.log(`[Pipeline] Stage ${i + 1}/${stages.length}: "${identityName}" (${stage.type})`);

        const startedAt = new Date().toISOString();
        let output = '';

        // Build accumulated context from previous stages
        const context = this.buildContext(directive, stageOutputs, stage);

        switch (stage.type) {
          case 'refine':
            output = await this.executeRefineStage(stage, identity, context);
            break;
          case 'execute':
            output = await this.executeExecuteStage(
              stage, identity, directive, conscriptId, workingDirectory, context
            );
            break;
          case 'review':
            output = await this.executeReviewStage(
              stage, identity, conscriptId, workingDirectory, context
            );
            break;
          case 'human':
            output = await this.executeHumanStage(pipelineRun.id, conscriptId, context);
            break;
        }

        const completedAt = new Date().toISOString();
        stageOutputs.push({
          stageId: stage.id,
          stageType: stage.type,
          identityName,
          output,
          startedAt,
          completedAt,
        });

        // Broadcast progress
        this.broadcastStageComplete(directive.id, i, stages.length);
      }

      // Pipeline complete
      dbService.updatePipelineRun(pipelineRun.id, {
        status: 'completed',
        currentStageIndex: stages.length,
        stageOutputs,
      });

      console.log(`[Pipeline] Pipeline "${workflow.name}" completed for directive "${directive.title}"`);
    } catch (err) {
      console.error(`[Pipeline] Pipeline failed:`, err);
      dbService.updatePipelineRun(pipelineRun.id, {
        status: 'failed',
        stageOutputs,
      });
      throw err;
    }
  }

  /**
   * Resume a paused pipeline at a human stage.
   */
  resumeHumanStage(pipelineRunId: string, input: string): void {
    const resolver = this.humanResolvers.get(pipelineRunId);
    if (resolver) {
      resolver(input);
      this.humanResolvers.delete(pipelineRunId);
    }
  }

  /**
   * Build context string from directive info + accumulated stage outputs.
   */
  private buildContext(
    directive: Directive,
    previousOutputs: PipelineStageOutput[],
    currentStage: WorkflowStage,
  ): string {
    const parts: string[] = [];

    parts.push(`# Directive: ${directive.title}`);
    parts.push(`\n## Description\n${directive.description}`);
    if (directive.acceptanceCriteria) {
      parts.push(`\n## Acceptance Criteria\n${directive.acceptanceCriteria}`);
    }
    parts.push(`\n**Priority:** ${directive.priority}`);
    if (directive.labels.length) {
      parts.push(`**Labels:** ${directive.labels.join(', ')}`);
    }

    if (previousOutputs.length > 0) {
      parts.push('\n---\n\n# Previous Stage Outputs\n');
      for (const prev of previousOutputs) {
        parts.push(`## Stage: ${prev.identityName} (${prev.stageType})`);
        parts.push(prev.output);
        parts.push('');
      }
    }

    if (currentStage.inputDescription) {
      parts.push(`\n---\n\n# Your Task\n${currentStage.inputDescription}`);
    }

    return parts.join('\n');
  }

  /**
   * Execute a refine stage — Claude call with no tools, produces text.
   */
  private async executeRefineStage(
    stage: WorkflowStage,
    identity: IdentityTemplate | null,
    context: string,
  ): Promise<string> {
    const { query } = await getSDK();

    const systemPrompt = identity?.systemPrompt ||
      'You are an expert analyst. Produce detailed, actionable output based on the input provided.';

    const queryOptions: Record<string, unknown> = {
      systemPrompt,
      tools: [],
      maxTurns: 1,
      settingSources: [],
      persistSession: false,
    };

    if (identity?.model) queryOptions.model = identity.model;

    let result = '';
    for await (const message of query({
      prompt: context,
      options: queryOptions as any,
    })) {
      if (message.type === 'result' && message.subtype === 'success') {
        result = (message as SDKResultSuccess).result;
      }
    }

    return result;
  }

  /**
   * Execute an execute stage — full conscript with tools.
   */
  private async executeExecuteStage(
    stage: WorkflowStage,
    identity: IdentityTemplate | null,
    directive: Directive,
    conscriptId: string,
    workingDirectory: string,
    context: string,
  ): Promise<string> {
    const settings = getSettings();
    const projectDir = workingDirectory || settings.git?.workingDirectory || '';

    const branchName = `conscript/${directive.id}-${directive.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40)}`;

    const campAlias = 'default'; // Will be improved when camp assignment is wired

    const identityConfig = identity ? {
      systemPrompt: identity.systemPrompt || undefined,
      model: identity.model,
      maxTurns: identity.maxTurns ?? undefined,
      maxBudgetUsd: identity.maxBudgetUsd ?? undefined,
      allowedTools: identity.allowedTools.length ? identity.allowedTools : undefined,
      disallowedTools: identity.disallowedTools.length ? identity.disallowedTools : undefined,
    } : undefined;

    // Assign directive to the conscript (triggers full agent pipeline)
    await conscriptManager.assignDirective(conscriptId, directive.id, {
      campAlias,
      branchName,
      refinedPrompt: context,
      workingDirectory: projectDir,
      identity: identityConfig,
    });

    // Poll until the conscript finishes (reaches QA_READY, ERROR, or IDLE)
    const terminalStates = new Set(['QA_READY', 'NEEDS_INPUT', 'ERROR', 'IDLE']);
    const result = await new Promise<string>((resolve) => {
      const check = () => {
        const conscript = dbService.getConscript(conscriptId);
        if (!conscript || terminalStates.has(conscript.status)) {
          const status = conscript?.status || 'UNKNOWN';
          resolve(`Execute stage completed (status: ${status}) by ${identity?.name || 'conscript'}.`);
          return;
        }
        setTimeout(check, 3000);
      };
      // Start polling after a brief delay to allow transition
      setTimeout(check, 5000);
    });

    return result;
  }

  /**
   * Execute a review stage — Claude call with read-only tools.
   */
  private async executeReviewStage(
    stage: WorkflowStage,
    identity: IdentityTemplate | null,
    conscriptId: string,
    workingDirectory: string,
    context: string,
  ): Promise<string> {
    const { query } = await getSDK();

    const systemPrompt = identity?.systemPrompt ||
      'You are a code reviewer. Analyze the work done and provide a quality score and detailed feedback.';

    const reviewPrompt = `${context}\n\n---\n\nReview the work above. Provide:\n1. A quality score (1-10)\n2. Whether this passes review (PASS or FAIL)\n3. Detailed feedback and suggestions`;

    const queryOptions: Record<string, unknown> = {
      systemPrompt,
      allowedTools: ['Read', 'Glob', 'Grep'],
      cwd: workingDirectory,
      maxTurns: 3,
      permissionMode: 'bypassPermissions',
      allowDangerouslySkipPermissions: true,
      settingSources: [],
      persistSession: false,
    };

    if (identity?.model) queryOptions.model = identity.model;

    let result = '';
    for await (const message of query({
      prompt: reviewPrompt,
      options: queryOptions as any,
    })) {
      if (message.type === 'result' && message.subtype === 'success') {
        result = (message as SDKResultSuccess).result;
      }
    }

    return result;
  }

  /**
   * Execute a human stage — pause and wait for input.
   */
  private async executeHumanStage(
    pipelineRunId: string,
    conscriptId: string,
    context: string,
  ): Promise<string> {
    // Set pipeline to paused
    dbService.updatePipelineRun(pipelineRunId, { status: 'paused' });

    // Notify UI that human input is needed
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send(IPC_CHANNELS.PIPELINE_STAGE_COMPLETE, {
        directiveId: '',
        stageIndex: -1,
        total: 0,
        paused: true,
        pipelineRunId,
      });
    }

    // Add a chat message prompting the human
    dbService.chatSend(conscriptId, 'Pipeline paused — awaiting human input. Use the pipeline panel to provide input and continue.', 'system');

    // Wait for human response
    const humanInput = await new Promise<string>((resolve) => {
      this.humanResolvers.set(pipelineRunId, resolve);
    });

    // Resume pipeline
    dbService.updatePipelineRun(pipelineRunId, { status: 'running' });

    return humanInput;
  }

  /**
   * Broadcast stage completion to all renderer windows.
   */
  private broadcastStageComplete(directiveId: string, stageIndex: number, total: number): void {
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send(IPC_CHANNELS.PIPELINE_STAGE_COMPLETE, {
        directiveId,
        stageIndex,
        total,
      });
    }
  }
}

// Singleton
export const pipelineExecutor = new PipelineExecutorService();
