import React, { useState, useEffect, useRef } from 'react';
import type { IdentityTemplate } from '../../shared/types';
import AiGeneratePopover from './AiGeneratePopover';

interface IdentityFormProps {
  identityId: string | null; // null = create new
  onSave: () => void;
  onCancel: () => void;
}

const KNOWN_TOOLS = [
  'Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep',
  'WebFetch', 'WebSearch', 'Task', 'TodoWrite', 'NotebookEdit',
];

const EMPTY_IDENTITY: Omit<IdentityTemplate, 'id' | 'createdAt' | 'updatedAt'> = {
  name: '',
  role: '',
  goal: '',
  backstory: '',
  portrait: null,
  systemPrompt: '',
  model: 'sonnet',
  effort: 'high',
  maxTurns: null,
  maxBudgetUsd: null,
  allowedTools: [],
  disallowedTools: [],
};

export default function IdentityForm({ identityId, onSave, onCancel }: IdentityFormProps) {
  const [form, setForm] = useState(EMPTY_IDENTITY);
  const [loading, setLoading] = useState(!!identityId);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState('');
  const [toolInput, setToolInput] = useState('');
  const [denyToolInput, setDenyToolInput] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!identityId) return;
    (async () => {
      const data = await window.sweatshop.identities.get(identityId);
      if (data) {
        const { id, createdAt, updatedAt, ...rest } = data;
        setForm(rest);
      }
      setLoading(false);
    })();
  }, [identityId]);

  const handlePortraitUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const size = 128;
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d')!;
        // Center-crop to square
        const minDim = Math.min(img.width, img.height);
        const sx = (img.width - minDim) / 2;
        const sy = (img.height - minDim) / 2;
        ctx.drawImage(img, sx, sy, minDim, minDim, 0, 0, size, size);
        setForm((prev) => ({ ...prev, portrait: canvas.toDataURL('image/png') }));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  };

  const handleGenerate = async (freeformText: string) => {
    setGenerating(true);
    setGenError('');
    try {
      const result = await window.sweatshop.identities.generate({ freeformInput: freeformText });
      setForm((prev) => ({
        ...prev,
        name: result.name || prev.name,
        role: result.role || prev.role,
        goal: result.goal || prev.goal,
        backstory: result.backstory || prev.backstory,
        systemPrompt: result.systemPrompt || prev.systemPrompt,
        model: result.model || prev.model,
        effort: result.effort || prev.effort,
        allowedTools: result.allowedTools.length ? result.allowedTools : prev.allowedTools,
        disallowedTools: result.disallowedTools.length ? result.disallowedTools : prev.disallowedTools,
      }));
    } catch (err: unknown) {
      setGenError(err instanceof Error ? err.message : 'AI generation failed');
    } finally {
      setGenerating(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      if (identityId) {
        await window.sweatshop.identities.update(identityId, form);
      } else {
        await window.sweatshop.identities.create(form);
      }
      onSave();
    } finally {
      setSaving(false);
    }
  };

  const addTool = (list: 'allowedTools' | 'disallowedTools', tool: string) => {
    const trimmed = tool.trim();
    if (!trimmed || form[list].includes(trimmed)) return;
    setForm((prev) => ({ ...prev, [list]: [...prev[list], trimmed] }));
  };

  const removeTool = (list: 'allowedTools' | 'disallowedTools', tool: string) => {
    setForm((prev) => ({ ...prev, [list]: prev[list].filter((t) => t !== tool) }));
  };

  if (loading) {
    return (
      <div className="identity-form-overlay">
        <div className="identity-form">
          <div className="identity-form-loading">Loading...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="identity-form-overlay" onClick={onCancel}>
      <form className="identity-form" onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit}>
        <div className="identity-form-header">
          <h2>{identityId ? 'Edit Identity' : 'New Identity'}</h2>
          <div className="identity-form-header-right">
            <AiGeneratePopover
              entityType="identity"
              onGenerate={handleGenerate}
              generating={generating}
            />
            <button type="button" className="identity-form-close" onClick={onCancel}>&times;</button>
          </div>
        </div>

        {genError && <div className="story-form-error">{genError}</div>}

        <div className="identity-form-body">
          {/* Portrait + Name row */}
          <div className="identity-form-top-row">
            <div className="identity-form-portrait-area">
              <div
                className="identity-form-portrait"
                onClick={() => fileInputRef.current?.click()}
                title="Click to upload portrait"
              >
                {form.portrait ? (
                  <img src={form.portrait} alt="Portrait" />
                ) : (
                  <div className="identity-form-portrait-placeholder">
                    <svg viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
                    </svg>
                    <span>Upload</span>
                  </div>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={handlePortraitUpload}
              />
              {form.portrait && (
                <button
                  type="button"
                  className="identity-form-remove-portrait"
                  onClick={() => setForm((prev) => ({ ...prev, portrait: null }))}
                >
                  Remove
                </button>
              )}
            </div>
            <div className="identity-form-name-group">
              <label>Name *</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                placeholder="e.g. Salesforce Architect"
                required
              />
              <label>Role</label>
              <input
                type="text"
                value={form.role}
                onChange={(e) => setForm((prev) => ({ ...prev, role: e.target.value }))}
                placeholder="e.g. architect, analyst, implementer"
              />
            </div>
          </div>

          {/* Goal */}
          <div className="identity-form-field">
            <label>Goal</label>
            <input
              type="text"
              value={form.goal}
              onChange={(e) => setForm((prev) => ({ ...prev, goal: e.target.value }))}
              placeholder="Single-sentence objective for this identity"
            />
          </div>

          {/* Backstory */}
          <div className="identity-form-field">
            <label>Backstory</label>
            <textarea
              value={form.backstory}
              onChange={(e) => setForm((prev) => ({ ...prev, backstory: e.target.value }))}
              placeholder="Domain expertise narrative..."
              rows={3}
            />
          </div>

          {/* System Prompt */}
          <div className="identity-form-field">
            <label>System Prompt</label>
            <textarea
              className="identity-form-mono"
              value={form.systemPrompt}
              onChange={(e) => setForm((prev) => ({ ...prev, systemPrompt: e.target.value }))}
              placeholder="Full system prompt text..."
              rows={6}
            />
          </div>

          {/* SDK Config row */}
          <div className="identity-form-row">
            <div className="identity-form-field identity-form-field--compact">
              <label>Model</label>
              <select
                value={form.model}
                onChange={(e) => setForm((prev) => ({ ...prev, model: e.target.value as IdentityTemplate['model'] }))}
              >
                <option value="haiku">Haiku</option>
                <option value="sonnet">Sonnet</option>
                <option value="opus">Opus</option>
              </select>
            </div>
            <div className="identity-form-field identity-form-field--compact">
              <label>Effort</label>
              <select
                value={form.effort}
                onChange={(e) => setForm((prev) => ({ ...prev, effort: e.target.value as IdentityTemplate['effort'] }))}
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="max">Max</option>
              </select>
            </div>
            <div className="identity-form-field identity-form-field--compact">
              <label>Max Turns</label>
              <input
                type="number"
                min="1"
                value={form.maxTurns ?? ''}
                onChange={(e) => setForm((prev) => ({ ...prev, maxTurns: e.target.value ? parseInt(e.target.value) : null }))}
                placeholder="No limit"
              />
            </div>
          </div>

          {/* Allowed Tools */}
          <div className="identity-form-field">
            <label>Allowed Tools</label>
            <div className="identity-form-tags">
              {form.allowedTools.map((t) => (
                <span key={t} className="identity-form-tag">
                  {t}
                  <button type="button" onClick={() => removeTool('allowedTools', t)}>&times;</button>
                </span>
              ))}
            </div>
            <div className="identity-form-tag-input">
              <select
                value=""
                onChange={(e) => { addTool('allowedTools', e.target.value); e.target.value = ''; }}
              >
                <option value="">Add known tool...</option>
                {KNOWN_TOOLS.filter((t) => !form.allowedTools.includes(t)).map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
              <input
                type="text"
                value={toolInput}
                onChange={(e) => setToolInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { e.preventDefault(); addTool('allowedTools', toolInput); setToolInput(''); }
                }}
                placeholder="Or type custom tool name..."
              />
            </div>
          </div>

          {/* Disallowed Tools */}
          <div className="identity-form-field">
            <label>Disallowed Tools</label>
            <div className="identity-form-tags">
              {form.disallowedTools.map((t) => (
                <span key={t} className="identity-form-tag identity-form-tag--deny">
                  {t}
                  <button type="button" onClick={() => removeTool('disallowedTools', t)}>&times;</button>
                </span>
              ))}
            </div>
            <div className="identity-form-tag-input">
              <select
                value=""
                onChange={(e) => { addTool('disallowedTools', e.target.value); e.target.value = ''; }}
              >
                <option value="">Add known tool...</option>
                {KNOWN_TOOLS.filter((t) => !form.disallowedTools.includes(t)).map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
              <input
                type="text"
                value={denyToolInput}
                onChange={(e) => setDenyToolInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { e.preventDefault(); addTool('disallowedTools', denyToolInput); setDenyToolInput(''); }
                }}
                placeholder="Or type custom tool name..."
              />
            </div>
          </div>
        </div>

        <div className="identity-form-footer">
          <button type="button" className="btn-secondary" onClick={onCancel}>Cancel</button>
          <button type="submit" className="btn-primary" disabled={saving || !form.name.trim()}>
            {saving ? 'Saving...' : identityId ? 'Save Changes' : 'Create Identity'}
          </button>
        </div>
      </form>
    </div>
  );
}
