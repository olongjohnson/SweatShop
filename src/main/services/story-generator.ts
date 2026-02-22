import type { SDKResultSuccess } from '@anthropic-ai/claude-agent-sdk';

// Prevent tsc from compiling dynamic import() into require()
// eslint-disable-next-line @typescript-eslint/no-implied-eval
const dynamicImport = new Function('specifier', 'return import(specifier)') as (specifier: string) => Promise<any>;

// ===== Helpers =====

/** Strip markdown code fences and extract JSON from LLM response */
function extractJson(raw: string): string {
  // Try to extract from ```json ... ``` or ``` ... ```
  const fenceMatch = raw.match(/```(?:json)?\s*\n?([\s\S]*?)```/);
  if (fenceMatch) return fenceMatch[1].trim();
  // Try to find raw JSON object
  const objMatch = raw.match(/\{[\s\S]*\}/);
  if (objMatch) return objMatch[0];
  return raw.trim();
}

// ===== Shared Priming =====

const SWEATSHOP_PRIMER = `SweatShop is an AI agent orchestration platform for Salesforce development.
It manages "Conscripts" (AI agents) that work on "Directives" (work tickets) using "Camps" (scratch orgs).
Agents operate in isolated git worktrees and can write Apex, LWC, metadata, and other Salesforce artifacts.
The platform uses the Claude Agent SDK for agent execution with MCP tools.`;

// ===== Story / Directive Generation =====

interface StoryInput {
  freeformInput: string;
  projectContext?: string;
}

interface StoryOutput {
  title: string;
  description: string;
  acceptanceCriteria: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  suggestedLabels: string[];
}

const STORY_SYSTEM_PROMPT = `${SWEATSHOP_PRIMER}

You are generating a Directive (work ticket) for AI agents to implement. A Directive has:
- title: Brief summary of the work to be done
- description: Detailed explanation of what needs to be built, including technical approach
- acceptanceCriteria: Testable criteria in "- [ ] ..." checklist format
- priority: low | medium | high | critical
- labels: Categorization tags (e.g. "apex", "lwc", "metadata", "testing", "bug-fix", etc.)

The user will describe what they want in freeform text. Map their description to all directive fields.
Keep descriptions focused on Salesforce development (Apex, LWC, metadata, flows, etc).
Make acceptance criteria specific and testable.

Respond with ONLY valid JSON in this exact format:
{
  "title": "Brief title for the directive",
  "description": "Detailed description of the work...",
  "acceptanceCriteria": "- [ ] Criterion 1\\n- [ ] Criterion 2\\n...",
  "priority": "low|medium|high|critical",
  "suggestedLabels": ["label1", "label2"]
}`;

export async function generateStoryDetails(input: StoryInput): Promise<StoryOutput> {
  const { query } = await dynamicImport('@anthropic-ai/claude-agent-sdk');

  const userContent = [
    input.freeformInput,
    input.projectContext ? `\n\n--- Project Reference ---\n${input.projectContext}` : '',
  ].filter(Boolean).join('');

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
    const parsed = JSON.parse(extractJson(text));
    const validPriorities = ['low', 'medium', 'high', 'critical'];
    return {
      title: parsed.title || '',
      description: parsed.description || '',
      acceptanceCriteria: parsed.acceptanceCriteria || '',
      priority: validPriorities.includes(parsed.priority) ? parsed.priority : 'medium',
      suggestedLabels: Array.isArray(parsed.suggestedLabels) ? parsed.suggestedLabels : [],
    };
  } catch {
    throw new Error('Failed to parse AI response. Please try again.');
  }
}

// ===== Identity Generation =====

interface IdentityInput {
  freeformInput: string;
  projectContext?: string;
}

interface IdentityOutput {
  name: string;
  role: string;
  goal: string;
  backstory: string;
  systemPrompt: string;
  model: 'sonnet' | 'opus' | 'haiku';
  effort: 'low' | 'medium' | 'high' | 'max';
  allowedTools: string[];
  disallowedTools: string[];
}

const IDENTITY_SYSTEM_PROMPT = `${SWEATSHOP_PRIMER}

You are generating an Identity Template — a persona configuration for an AI agent (Conscript). An Identity has:
- name: The persona name (e.g. "Apex Architect", "LWC Builder", "Code Reviewer")
- role: Concise role title (architect, analyst, implementer, reviewer, tester)
- goal: Single-sentence objective for this identity
- backstory: 2-3 sentence domain expertise narrative
- systemPrompt: Detailed system prompt instructing the agent how to behave, what to focus on, constraints
- model: AI model — "opus" for complex architecture/review, "sonnet" for standard implementation, "haiku" for simple analysis
- effort: Reasoning effort level — "low", "medium", "high", or "max"
- allowedTools: Tools the agent CAN use
- disallowedTools: Tools the agent CANNOT use

Available tools: Read, Write, Edit, Bash, Glob, Grep, WebFetch, WebSearch, Task, TodoWrite, NotebookEdit.
- Analysts/reviewers typically need: Read, Glob, Grep (read-only)
- Implementers need: Read, Write, Edit, Bash, Glob, Grep
- Architects may need: Read, Glob, Grep, WebSearch
- Use disallowedTools sparingly — only deny tools that could cause harm for the role.

The user will describe the kind of agent they want in freeform text. Map their description to all identity fields.

Respond with ONLY valid JSON in this exact format:
{
  "name": "Persona Name",
  "role": "role-title",
  "goal": "single-sentence objective",
  "backstory": "domain expertise narrative",
  "systemPrompt": "detailed system prompt...",
  "model": "sonnet|opus|haiku",
  "effort": "low|medium|high|max",
  "allowedTools": ["Read", "Write", "Edit"],
  "disallowedTools": []
}`;

export async function generateIdentityDetails(input: IdentityInput): Promise<IdentityOutput> {
  const { query } = await dynamicImport('@anthropic-ai/claude-agent-sdk');

  const userContent = [
    input.freeformInput,
    input.projectContext ? `\n\n--- Project Reference ---\n${input.projectContext}` : '',
  ].filter(Boolean).join('');

  let text = '';

  for await (const message of query({
    prompt: userContent,
    options: {
      systemPrompt: IDENTITY_SYSTEM_PROMPT,
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
    const validModels = ['sonnet', 'opus', 'haiku'];
    const validEfforts = ['low', 'medium', 'high', 'max'];
    return {
      name: parsed.name || '',
      role: parsed.role || '',
      goal: parsed.goal || '',
      backstory: parsed.backstory || '',
      systemPrompt: parsed.systemPrompt || '',
      model: validModels.includes(parsed.model) ? parsed.model : 'sonnet',
      effort: validEfforts.includes(parsed.effort) ? parsed.effort : 'high',
      allowedTools: Array.isArray(parsed.allowedTools) ? parsed.allowedTools : [],
      disallowedTools: Array.isArray(parsed.disallowedTools) ? parsed.disallowedTools : [],
    };
  } catch {
    throw new Error('Failed to parse AI response. Please try again.');
  }
}

// ===== Workflow Generation =====

interface WorkflowInput {
  freeformInput: string;
  projectContext?: string;
  availableIdentities: Array<{ id: string; name: string; role: string }>;
}

interface WorkflowStageOutput {
  type: 'refine' | 'execute' | 'review' | 'human';
  identityTemplateId: string | null;
  inputDescription: string;
  outputDescription: string;
}

interface WorkflowOutput {
  name: string;
  description: string;
  stages: WorkflowStageOutput[];
}

const WORKFLOW_SYSTEM_PROMPT = `${SWEATSHOP_PRIMER}

You are generating a Workflow Template — a multi-stage pipeline that Directives pass through. A Workflow has:
- name: Pipeline name (e.g. "Standard Dev Pipeline", "TDD Flow", "Review-First Pipeline")
- description: Concise description of the workflow's purpose
- stages: Ordered list of pipeline stages

Stage types:
- "refine": Text-only Claude call — prompt processor, analyst, decomposer. No file access.
- "execute": Full agent with tools — actually writes code in a git worktree.
- "review": Read-only Claude call — code reviewer, quality scorer. Can read files but not write.
- "human": Pauses pipeline for human input/approval. No identity needed.

Each stage references an Identity Template (except human stages). Use the identity IDs from the available list.

The user will describe the kind of pipeline they want in freeform text. Map their description to all workflow fields.
Design 2-5 stages. Match identities to appropriate stage types.
If no suitable identity exists for a stage, set identityTemplateId to null.
Always include at least one "execute" stage.

Respond with ONLY valid JSON in this exact format:
{
  "name": "Pipeline Name",
  "description": "concise workflow description",
  "stages": [
    {
      "type": "refine|execute|review|human",
      "identityTemplateId": "id-from-available-list or null",
      "inputDescription": "what this stage does",
      "outputDescription": "what it produces"
    }
  ]
}`;

export async function generateWorkflowDetails(input: WorkflowInput): Promise<WorkflowOutput> {
  const { query } = await dynamicImport('@anthropic-ai/claude-agent-sdk');

  const identityList = input.availableIdentities.length > 0
    ? input.availableIdentities.map((i) => `- ID: "${i.id}", Name: "${i.name}", Role: "${i.role}"`).join('\n')
    : '(No identities available — set identityTemplateId to null for all stages)';

  const userContent = [
    input.freeformInput,
    `\nAvailable identities:\n${identityList}`,
    input.projectContext ? `\n\n--- Project Reference ---\n${input.projectContext}` : '',
  ].filter(Boolean).join('');

  let text = '';

  for await (const message of query({
    prompt: userContent,
    options: {
      systemPrompt: WORKFLOW_SYSTEM_PROMPT,
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
    const validTypes = ['refine', 'execute', 'review', 'human'];
    const validIds = new Set(input.availableIdentities.map((i) => i.id));

    return {
      name: parsed.name || '',
      description: parsed.description || '',
      stages: Array.isArray(parsed.stages) ? parsed.stages.map((s: any) => ({
        type: validTypes.includes(s.type) ? s.type : 'refine',
        identityTemplateId: s.type === 'human' ? null : (validIds.has(s.identityTemplateId) ? s.identityTemplateId : null),
        inputDescription: s.inputDescription || '',
        outputDescription: s.outputDescription || '',
      })) : [],
    };
  } catch {
    throw new Error('Failed to parse AI response. Please try again.');
  }
}
