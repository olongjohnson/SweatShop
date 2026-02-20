import type { SDKResultSuccess } from '@anthropic-ai/claude-agent-sdk';

// Prevent tsc from compiling dynamic import() into require()
// eslint-disable-next-line @typescript-eslint/no-implied-eval
const dynamicImport = new Function('specifier', 'return import(specifier)') as (specifier: string) => Promise<any>;

interface StoryInput {
  title: string;
  description?: string;
  projectContext?: string;
}

interface StoryOutput {
  description: string;
  acceptanceCriteria: string;
  suggestedLabels: string[];
}

const STORY_SYSTEM_PROMPT = `You are a Salesforce development story writer. Given a ticket title and optional context, generate a detailed user story with acceptance criteria suitable for an AI agent to implement.

Respond with ONLY valid JSON in this exact format:
{
  "description": "Detailed description of the story...",
  "acceptanceCriteria": "- [ ] Criterion 1\\n- [ ] Criterion 2\\n...",
  "suggestedLabels": ["label1", "label2"]
}

Keep descriptions focused on Salesforce development (Apex, LWC, metadata, etc). Make acceptance criteria specific and testable.`;

export async function generateStoryDetails(input: StoryInput): Promise<StoryOutput> {
  const { query } = await dynamicImport('@anthropic-ai/claude-agent-sdk');

  const userContent = [
    `Title: ${input.title}`,
    input.description ? `Existing description: ${input.description}` : '',
    input.projectContext ? `Project context: ${input.projectContext}` : '',
  ].filter(Boolean).join('\n\n');

  let text = '';

  for await (const message of query({
    prompt: userContent,
    options: {
      systemPrompt: STORY_SYSTEM_PROMPT,
      tools: [],
      maxTurns: 1,
      settingSources: [],
      persistSession: false,
    },
  })) {
    if (message.type === 'result' && message.subtype === 'success') {
      text = (message as SDKResultSuccess).result;
    }
  }

  try {
    const parsed = JSON.parse(text);
    return {
      description: parsed.description || '',
      acceptanceCriteria: parsed.acceptanceCriteria || '',
      suggestedLabels: Array.isArray(parsed.suggestedLabels) ? parsed.suggestedLabels : [],
    };
  } catch {
    throw new Error('Failed to parse AI response. Please try again.');
  }
}
