import Anthropic from '@anthropic-ai/sdk';
import { getSettings } from './settings';

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

export async function generateStoryDetails(input: StoryInput): Promise<StoryOutput> {
  const settings = getSettings();
  const apiKey = settings.anthropicApiKey || process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    throw new Error('Anthropic API key not configured. Set it in Settings or ANTHROPIC_API_KEY env var.');
  }

  const client = new Anthropic({ apiKey });

  const userContent = [
    `Title: ${input.title}`,
    input.description ? `Existing description: ${input.description}` : '',
    input.projectContext ? `Project context: ${input.projectContext}` : '',
  ].filter(Boolean).join('\n\n');

  const message = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1024,
    system: `You are a Salesforce development story writer. Given a ticket title and optional context, generate a detailed user story with acceptance criteria suitable for an AI agent to implement.

Respond with ONLY valid JSON in this exact format:
{
  "description": "Detailed description of the story...",
  "acceptanceCriteria": "- [ ] Criterion 1\\n- [ ] Criterion 2\\n...",
  "suggestedLabels": ["label1", "label2"]
}

Keep descriptions focused on Salesforce development (Apex, LWC, metadata, etc). Make acceptance criteria specific and testable.`,
    messages: [{ role: 'user', content: userContent }],
  });

  const text = message.content[0].type === 'text' ? message.content[0].text : '';

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
