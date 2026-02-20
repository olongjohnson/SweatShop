import type { SDKResultSuccess } from '@anthropic-ai/claude-agent-sdk';
import * as dbService from './database';
import type { Ticket } from '../../shared/types';

// Prevent tsc from compiling dynamic import() into require()
// eslint-disable-next-line @typescript-eslint/no-implied-eval
const dynamicImport = new Function('specifier', 'return import(specifier)') as (specifier: string) => Promise<any>;

const REFINER_SYSTEM_PROMPT = `You are a prompt engineer specializing in Salesforce development tasks.
Given a ticket (title, description, acceptance criteria), produce a detailed
development prompt that an AI agent can follow to implement the work.

The prompt should be:
- Specific and actionable (not vague)
- Include step-by-step approach
- Reference specific Salesforce patterns (Apex, LWC, metadata)
- Include test requirements if applicable
- Be self-contained (the agent has no other context beyond what you provide)

Output ONLY the refined prompt text — no preamble, no commentary.`;

export async function refineTicket(
  ticket: Ticket,
  context?: {
    projectStructure?: string;
    conventions?: string;
    relatedFiles?: string[];
  }
): Promise<string> {
  const { query } = await dynamicImport('@anthropic-ai/claude-agent-sdk');

  let userMessage = `## Ticket\n\n`;
  userMessage += `**Title:** ${ticket.title}\n\n`;
  userMessage += `**Description:**\n${ticket.description}\n\n`;
  userMessage += `**Acceptance Criteria:**\n${ticket.acceptanceCriteria}\n\n`;
  userMessage += `**Priority:** ${ticket.priority}\n`;
  userMessage += `**Labels:** ${ticket.labels.join(', ') || 'none'}\n\n`;

  if (context?.projectStructure) {
    userMessage += `## Project Structure\n\`\`\`\n${context.projectStructure}\n\`\`\`\n\n`;
  }
  if (context?.conventions) {
    userMessage += `## Coding Conventions\n${context.conventions}\n\n`;
  }
  if (context?.relatedFiles?.length) {
    userMessage += `## Likely Related Files\n${context.relatedFiles.map((f) => `- ${f}`).join('\n')}\n\n`;
  }

  userMessage += `Produce a detailed, step-by-step development prompt for an AI agent to implement this ticket.`;

  let refinedPrompt = '';

  for await (const message of query({
    prompt: userMessage,
    options: {
      systemPrompt: REFINER_SYSTEM_PROMPT,
      tools: [],
      maxTurns: 1,
      settingSources: [],
      persistSession: false,
    },
  })) {
    if (message.type === 'result' && message.subtype === 'success') {
      refinedPrompt = (message as SDKResultSuccess).result;
    }
  }

  // Store in refined_prompts table
  dbService.createRefinedPrompt({
    ticketId: ticket.id,
    promptText: refinedPrompt,
  });

  return refinedPrompt;
}
