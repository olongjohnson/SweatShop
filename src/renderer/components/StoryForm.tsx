import React, { useState, useEffect, useMemo } from 'react';
import type { Directive, DirectiveStatus, WorkflowTemplate } from '../../shared/types';
import AiGeneratePopover from './AiGeneratePopover';

interface StoryFormProps {
  directive: Directive | null;
  allDirectives: Directive[];
  onClose: () => void;
}

export default function StoryForm({ directive, allDirectives, onClose }: StoryFormProps) {
  const isEdit = !!directive;

  const [title, setTitle] = useState(directive?.title || '');
  const [description, setDescription] = useState(directive?.description || '');
  const [acceptanceCriteria, setAcceptanceCriteria] = useState(directive?.acceptanceCriteria || '');
  const [priority, setPriority] = useState<Directive['priority']>(directive?.priority || 'medium');
  const [status, setStatus] = useState<DirectiveStatus>(directive?.status || 'backlog');
  const [labels, setLabels] = useState<string[]>(directive?.labels || []);
  const [labelInput, setLabelInput] = useState('');
  const [dependsOn, setDependsOn] = useState<string[]>(directive?.dependsOn || []);
  const [workflowTemplateId, setWorkflowTemplateId] = useState<string>(directive?.workflowTemplateId || '');
  const [workflows, setWorkflows] = useState<WorkflowTemplate[]>([]);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState('');
  const [depSearch, setDepSearch] = useState('');
  const [depDropdownOpen, setDepDropdownOpen] = useState(false);

  useEffect(() => {
    window.sweatshop.workflows.list().then(setWorkflows).catch(() => {});
  }, []);

  const handleLabelKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && labelInput.trim()) {
      e.preventDefault();
      if (!labels.includes(labelInput.trim())) {
        setLabels([...labels, labelInput.trim()]);
      }
      setLabelInput('');
    }
  };

  const removeLabel = (label: string) => {
    setLabels(labels.filter((l) => l !== label));
  };

  const handleGenerate = async (freeformText: string) => {
    setGenerating(true);
    setGenError('');
    try {
      const result = await window.sweatshop.stories.generate({ freeformInput: freeformText });
      if (result.title) setTitle(result.title);
      setDescription(result.description);
      setAcceptanceCriteria(result.acceptanceCriteria);
      if (result.priority) setPriority(result.priority);
      if (result.suggestedLabels.length > 0) {
        setLabels((prev) => [...new Set([...prev, ...result.suggestedLabels])]);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'AI generation failed';
      setGenError(msg);
    } finally {
      setGenerating(false);
    }
  };

  const handleSave = async () => {
    if (!title.trim()) return;
    setSaving(true);
    try {
      const data = {
        source: directive?.source || 'manual' as const,
        title: title.trim(),
        description,
        acceptanceCriteria,
        priority,
        status,
        labels,
        dependsOn,
        externalId: directive?.externalId,
        workflowTemplateId: workflowTemplateId || undefined,
      };

      if (isEdit) {
        await window.sweatshop.directives.update(directive.id, data);
      } else {
        await window.sweatshop.directives.create(data);
      }
      onClose();
    } catch (err) {
      console.error('Save failed:', err);
    } finally {
      setSaving(false);
    }
  };

  // Other directives for dependency selection (exclude self)
  const otherDirectives = allDirectives.filter((t) => t.id !== directive?.id);

  const depSuggestions = useMemo(() => {
    if (!depSearch.trim()) return otherDirectives.filter((d) => !dependsOn.includes(d.id)).slice(0, 8);
    const q = depSearch.toLowerCase();
    return otherDirectives
      .filter((d) => !dependsOn.includes(d.id) && d.title.toLowerCase().includes(q))
      .slice(0, 8);
  }, [otherDirectives, dependsOn, depSearch]);

  const selectedDeps = useMemo(() => {
    return dependsOn.map((id) => allDirectives.find((d) => d.id === id)).filter(Boolean) as Directive[];
  }, [dependsOn, allDirectives]);

  const addDep = (id: string) => {
    setDependsOn((prev) => prev.includes(id) ? prev : [...prev, id]);
    setDepSearch('');
  };

  const removeDep = (id: string) => {
    setDependsOn((prev) => prev.filter((d) => d !== id));
  };

  return (
    <div className="story-form-overlay" onClick={onClose}>
      <div className="story-form" onClick={(e) => e.stopPropagation()}>
        <div className="story-form-header">
          <h3>{isEdit ? 'Edit Story' : 'New Story'}</h3>
          <div className="story-form-header-right">
            {directive?.source === 'deathmark' && (
              <span className="story-source-badge deathmark">
                Synced from Deathmark {directive.externalId ? `(${directive.externalId})` : ''}
              </span>
            )}
            <AiGeneratePopover
              entityType="directive"
              onGenerate={handleGenerate}
              generating={generating}
            />
            <button className="story-form-close" onClick={onClose}>x</button>
          </div>
        </div>

        {genError && <div className="story-form-error">{genError}</div>}

        <div className="story-form-body">
          <label>
            Title *
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Implement OAuth2 login flow"
            />
          </label>

          <label>
            Description *
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Detailed description..."
              rows={5}
            />
          </label>

          <label>
            Acceptance Criteria
            <textarea
              value={acceptanceCriteria}
              onChange={(e) => setAcceptanceCriteria(e.target.value)}
              placeholder="- [ ] Criterion 1&#10;- [ ] Criterion 2"
              rows={4}
            />
          </label>

          <div className="story-form-row">
            <label>
              Priority
              <select value={priority} onChange={(e) => setPriority(e.target.value as Directive['priority'])}>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </select>
            </label>

            <label>
              Status
              <select value={status} onChange={(e) => setStatus(e.target.value as DirectiveStatus)}>
                <option value="backlog">Backlog</option>
                <option value="ready">Ready</option>
                <option value="in_progress">In Progress</option>
                <option value="qa_review">QA Review</option>
                <option value="approved">Approved</option>
                <option value="merged">Merged</option>
                <option value="rejected">Rejected</option>
              </select>
            </label>
          </div>

          {workflows.length > 0 && (
            <label>
              Workflow Pipeline
              <select
                value={workflowTemplateId}
                onChange={(e) => setWorkflowTemplateId(e.target.value)}
              >
                <option value="">No workflow (default dispatch)</option>
                {workflows.map((wf) => (
                  <option key={wf.id} value={wf.id}>
                    {wf.name} ({wf.stages.length} stage{wf.stages.length !== 1 ? 's' : ''})
                  </option>
                ))}
              </select>
            </label>
          )}

          <label>
            Labels
            <div className="label-input-area">
              {labels.map((l) => (
                <span key={l} className="label-tag">
                  {l}
                  <button onClick={() => removeLabel(l)}>x</button>
                </span>
              ))}
              <input
                type="text"
                value={labelInput}
                onChange={(e) => setLabelInput(e.target.value)}
                onKeyDown={handleLabelKeyDown}
                placeholder="Type and press Enter"
              />
            </div>
          </label>

          {otherDirectives.length > 0 && (
            <div className="dep-picker">
              <label>Dependencies</label>
              {selectedDeps.length > 0 && (
                <div className="dep-picker-tags">
                  {selectedDeps.map((d) => (
                    <span key={d.id} className="dep-picker-tag">
                      {d.title}
                      <button type="button" onClick={() => removeDep(d.id)}>x</button>
                    </span>
                  ))}
                </div>
              )}
              <div className="dep-picker-input-wrapper">
                <input
                  type="text"
                  className="dep-picker-search"
                  value={depSearch}
                  onChange={(e) => { setDepSearch(e.target.value); setDepDropdownOpen(true); }}
                  onFocus={() => setDepDropdownOpen(true)}
                  onBlur={() => setTimeout(() => setDepDropdownOpen(false), 150)}
                  placeholder="Search directives to add..."
                />
                {depDropdownOpen && depSuggestions.length > 0 && (
                  <div className="dep-picker-dropdown">
                    {depSuggestions.map((d) => (
                      <div
                        key={d.id}
                        className="dep-picker-option"
                        onMouseDown={(e) => { e.preventDefault(); addDep(d.id); }}
                      >
                        <span className="dep-picker-option-title">{d.title}</span>
                        <span className="dep-picker-option-status">{d.status.replace('_', ' ')}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="story-form-footer">
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={handleSave} disabled={saving || !title.trim()}>
            {saving ? 'Saving...' : isEdit ? 'Update' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  );
}
