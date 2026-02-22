import React, { useState, useEffect } from 'react';
import type { IdentityTemplate, WorkflowTemplate, WorkflowStage, WorkflowStageType } from '../../shared/types';
import AiGeneratePopover from './AiGeneratePopover';

interface WorkflowFormProps {
  workflowId: string | null; // null = create new
  onSave: () => void;
  onCancel: () => void;
}

const STAGE_TYPES: { value: WorkflowStageType; label: string; desc: string }[] = [
  { value: 'refine', label: 'Refine', desc: 'Text-only Claude call (prompt processor)' },
  { value: 'execute', label: 'Execute', desc: 'Full agent with tools (writes code)' },
  { value: 'review', label: 'Review', desc: 'Read-only Claude call (code scorer)' },
  { value: 'human', label: 'Human', desc: 'Pause for human input' },
];

interface StageRow {
  id: string;
  type: WorkflowStageType;
  identityTemplateId: string | null;
  inputDescription: string;
  outputDescription: string;
}

function makeStageId(): string {
  return `stage-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export default function WorkflowForm({ workflowId, onSave, onCancel }: WorkflowFormProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [stages, setStages] = useState<StageRow[]>([]);
  const [identities, setIdentities] = useState<IdentityTemplate[]>([]);
  const [loading, setLoading] = useState(!!workflowId);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState('');

  useEffect(() => {
    (async () => {
      const idList = await window.sweatshop.identities.list();
      setIdentities(idList);

      if (workflowId) {
        const wf = await window.sweatshop.workflows.get(workflowId);
        if (wf) {
          setName(wf.name);
          setDescription(wf.description);
          setStages(
            [...wf.stages]
              .sort((a, b) => a.order - b.order)
              .map((s) => ({
                id: s.id,
                type: s.type,
                identityTemplateId: s.identityTemplateId,
                inputDescription: s.inputDescription,
                outputDescription: s.outputDescription,
              }))
          );
        }
      }
      setLoading(false);
    })();
  }, [workflowId]);

  const addStage = () => {
    setStages((prev) => [
      ...prev,
      {
        id: makeStageId(),
        type: 'refine',
        identityTemplateId: null,
        inputDescription: '',
        outputDescription: '',
      },
    ]);
  };

  const removeStage = (id: string) => {
    setStages((prev) => prev.filter((s) => s.id !== id));
  };

  const updateStage = (id: string, patch: Partial<StageRow>) => {
    setStages((prev) =>
      prev.map((s) => (s.id === id ? { ...s, ...patch } : s))
    );
  };

  const moveStage = (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= stages.length) return;
    setStages((prev) => {
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const handleGenerate = async (freeformText: string) => {
    setGenerating(true);
    setGenError('');
    try {
      const result = await window.sweatshop.workflows.generate({
        freeformInput: freeformText,
        availableIdentities: identities.map((i) => ({ id: i.id, name: i.name, role: i.role })),
      });
      if (result.name) setName(result.name);
      if (result.description) setDescription(result.description);
      if (result.stages.length > 0) {
        setStages(result.stages.map((s) => ({
          id: makeStageId(),
          type: s.type,
          identityTemplateId: s.identityTemplateId,
          inputDescription: s.inputDescription,
          outputDescription: s.outputDescription,
        })));
      }
    } catch (err: unknown) {
      setGenError(err instanceof Error ? err.message : 'AI generation failed');
    } finally {
      setGenerating(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || stages.length === 0) return;
    setSaving(true);
    try {
      const stageData: WorkflowStage[] = stages.map((s, i) => ({
        id: s.id,
        identityTemplateId: s.type === 'human' ? null : s.identityTemplateId,
        order: i,
        type: s.type,
        inputDescription: s.inputDescription,
        outputDescription: s.outputDescription,
      }));

      if (workflowId) {
        await window.sweatshop.workflows.update(workflowId, {
          name: name.trim(),
          description: description.trim(),
          stages: stageData,
        });
      } else {
        await window.sweatshop.workflows.create({
          name: name.trim(),
          description: description.trim(),
          stages: stageData,
        });
      }
      onSave();
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="workflow-form-overlay">
        <div className="workflow-form">
          <div className="commissariat-loading">Loading...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="workflow-form-overlay" onClick={onCancel}>
      <form className="workflow-form" onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit}>
        <div className="workflow-form-header">
          <h2>{workflowId ? 'Edit Workflow' : 'New Workflow'}</h2>
          <div className="workflow-form-header-right">
            <AiGeneratePopover
              entityType="workflow"
              onGenerate={handleGenerate}
              generating={generating}
            />
            <button type="button" className="identity-form-close" onClick={onCancel}>&times;</button>
          </div>
        </div>

        {genError && <div className="story-form-error">{genError}</div>}

        <div className="workflow-form-body">
          <div className="workflow-form-field">
            <label>Name *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Standard Dev Pipeline"
              required
            />
          </div>

          <div className="workflow-form-field">
            <label>Description</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Multi-stage pipeline with code review"
            />
          </div>

          <div className="workflow-form-stages-header">
            <label>Stages ({stages.length})</label>
            <button type="button" className="btn-secondary btn-small" onClick={addStage}>
              + Add Stage
            </button>
          </div>

          {stages.length === 0 ? (
            <div className="workflow-form-stages-empty">
              No stages yet. Add at least one stage to create a workflow.
            </div>
          ) : (
            <div className="workflow-form-stages">
              {stages.map((stage, i) => (
                <div key={stage.id} className="workflow-form-stage-row">
                  <div className="workflow-form-stage-order">
                    <button
                      type="button"
                      className="workflow-form-move-btn"
                      disabled={i === 0}
                      onClick={() => moveStage(i, -1)}
                      title="Move up"
                    >
                      &uarr;
                    </button>
                    <span className="workflow-form-stage-num">{i + 1}</span>
                    <button
                      type="button"
                      className="workflow-form-move-btn"
                      disabled={i === stages.length - 1}
                      onClick={() => moveStage(i, 1)}
                      title="Move down"
                    >
                      &darr;
                    </button>
                  </div>

                  <div className="workflow-form-stage-fields">
                    <div className="workflow-form-stage-top">
                      <select
                        className="workflow-form-type-select"
                        value={stage.type}
                        onChange={(e) => updateStage(stage.id, { type: e.target.value as WorkflowStageType })}
                      >
                        {STAGE_TYPES.map((t) => (
                          <option key={t.value} value={t.value}>{t.label} — {t.desc}</option>
                        ))}
                      </select>

                      {stage.type !== 'human' && (
                        <select
                          className="workflow-form-identity-select"
                          value={stage.identityTemplateId || ''}
                          onChange={(e) => updateStage(stage.id, { identityTemplateId: e.target.value || null })}
                        >
                          <option value="">No identity</option>
                          {identities.map((id) => (
                            <option key={id.id} value={id.id}>{id.name} ({id.role || id.model})</option>
                          ))}
                        </select>
                      )}
                    </div>

                    <div className="workflow-form-stage-bottom">
                      <input
                        type="text"
                        value={stage.inputDescription}
                        onChange={(e) => updateStage(stage.id, { inputDescription: e.target.value })}
                        placeholder="What this stage does..."
                      />
                      <input
                        type="text"
                        value={stage.outputDescription}
                        onChange={(e) => updateStage(stage.id, { outputDescription: e.target.value })}
                        placeholder="What it produces..."
                      />
                    </div>
                  </div>

                  <button
                    type="button"
                    className="workflow-form-remove-btn"
                    onClick={() => removeStage(stage.id)}
                    title="Remove stage"
                  >
                    &times;
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="workflow-form-footer">
          <button type="button" className="btn-secondary" onClick={onCancel}>Cancel</button>
          <button type="submit" className="btn-primary" disabled={saving || !name.trim() || stages.length === 0}>
            {saving ? 'Saving...' : workflowId ? 'Save Changes' : 'Create Workflow'}
          </button>
        </div>
      </form>
    </div>
  );
}
