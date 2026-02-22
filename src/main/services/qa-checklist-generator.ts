import type { SDKResultSuccess } from '@anthropic-ai/claude-agent-sdk';
import type { Directive, QaChecklistItem } from '../../shared/types';

// Prevent tsc from compiling dynamic import() into require()
// eslint-disable-next-line @typescript-eslint/no-implied-eval
const dynamicImport = new Function('specifier', 'return import(specifier)') as (specifier: string) => Promise<any>;

/** Strip markdown code fences and extract JSON from LLM response */
function extractJson(raw: string): string {
  const fenceMatch = raw.match(/```(?:json)?\s*\n?([\s\S]*?)```/);
  if (fenceMatch) return fenceMatch[1].trim();
  const objMatch = raw.match(/\{[\s\S]*\}/);
  if (objMatch) return objMatch[0];
  return raw.trim();
}

const SYSTEM_PROMPT = `You are a QA checklist generator for SweatShop, an AI agent orchestration platform for Salesforce development.

Given a directive (work ticket) and a summary of the code changes made, generate a thorough QA checklist that a human reviewer should verify before approving the work.

The checklist should cover:
- Acceptance criteria verification (does the code meet each stated criterion?)
- Code quality concerns specific to the changes (naming, structure, patterns)
- Edge cases and error handling relevant to what was changed
- Salesforce-specific concerns (governor limits, bulk patterns, SOQL injection, FLS/CRUD)
- Deployment readiness (metadata dependencies, test coverage, permissions)

Generate 8-15 checklist items. Each item should be a concise, actionable verification step.
Tailor items to the ACTUAL changes — don't add generic items that don't apply.

Respond with ONLY valid JSON in this exact format:
{
  "checklist": [
    { "id": "qa-1", "label": "Verify the trigger handles bulk inserts of 200+ records", "checked": false },
    { "id": "qa-2", "label": "Check that field-level security is enforced on Account.CustomField__c", "checked": false }
  ]
}`;

interface QaChecklistInput {
  directive: Directive;
  diffSummary: string;
  commitLog: string;
}

export async function generateQaChecklist(input: QaChecklistInput): Promise<QaChecklistItem[]> {
  const { query } = await dynamicImport('@anthropic-ai/claude-agent-sdk');

  const userContent = [
    `## Directive: ${input.directive.title}`,
    input.directive.description ? `\n### Description\n${input.directive.description}` : '',
    input.directive.acceptanceCriteria ? `\n### Acceptance Criteria\n${input.directive.acceptanceCriteria}` : '',
    `\n### Code Changes\n${input.diffSummary}`,
    input.commitLog ? `\n### Commits\n${input.commitLog}` : '',
  ].filter(Boolean).join('');

  let text = '';

  for await (const message of query({
    prompt: userContent,
    options: {
      systemPrompt: SYSTEM_PROMPT,
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
    const parsed = JSON.parse(extractJson(text));
    if (!Array.isArray(parsed.checklist)) throw new Error('Missing checklist array');
    return parsed.checklist.map((item: any, i: number) => ({
      id: item.id || `qa-${i + 1}`,
      label: item.label || '',
      checked: false,
    }));
  } catch {
    throw new Error('Failed to parse QA checklist response. Please try again.');
  }
}
