import React, { useState, useEffect } from 'react';
import type { Ticket, TicketStatus } from '../../shared/types';

interface StoryFormProps {
  ticket: Ticket | null;
  allTickets: Ticket[];
  onClose: () => void;
}

export default function StoryForm({ ticket, allTickets, onClose }: StoryFormProps) {
  const isEdit = !!ticket;

  const [title, setTitle] = useState(ticket?.title || '');
  const [description, setDescription] = useState(ticket?.description || '');
  const [acceptanceCriteria, setAcceptanceCriteria] = useState(ticket?.acceptanceCriteria || '');
  const [priority, setPriority] = useState<Ticket['priority']>(ticket?.priority || 'medium');
  const [status, setStatus] = useState<TicketStatus>(ticket?.status || 'backlog');
  const [labels, setLabels] = useState<string[]>(ticket?.labels || []);
  const [labelInput, setLabelInput] = useState('');
  const [dependsOn, setDependsOn] = useState<string[]>(ticket?.dependsOn || []);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [aiError, setAiError] = useState('');

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

  const toggleDependency = (id: string) => {
    setDependsOn((prev) =>
      prev.includes(id) ? prev.filter((d) => d !== id) : [...prev, id]
    );
  };

  const handleAiAssist = async () => {
    if (!title.trim()) return;
    setGenerating(true);
    setAiError('');
    try {
      const result = await window.sweatshop.stories.generate({
        title,
        description: description || undefined,
      });
      setDescription(result.description);
      setAcceptanceCriteria(result.acceptanceCriteria);
      if (result.suggestedLabels.length > 0) {
        setLabels((prev) => [...new Set([...prev, ...result.suggestedLabels])]);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'AI generation failed';
      setAiError(msg);
    } finally {
      setGenerating(false);
    }
  };

  const handleSave = async () => {
    if (!title.trim()) return;
    setSaving(true);
    try {
      const data = {
        source: ticket?.source || 'manual' as const,
        title: title.trim(),
        description,
        acceptanceCriteria,
        priority,
        status,
        labels,
        dependsOn,
        externalId: ticket?.externalId,
      };

      if (isEdit) {
        await window.sweatshop.tickets.update(ticket.id, data);
      } else {
        await window.sweatshop.tickets.create(data);
      }
      onClose();
    } catch (err) {
      console.error('Save failed:', err);
    } finally {
      setSaving(false);
    }
  };

  // Other tickets for dependency selection (exclude self)
  const otherTickets = allTickets.filter((t) => t.id !== ticket?.id);

  return (
    <div className="story-form-overlay" onClick={onClose}>
      <div className="story-form" onClick={(e) => e.stopPropagation()}>
        <div className="story-form-header">
          <h3>{isEdit ? 'Edit Story' : 'New Story'}</h3>
          {ticket?.source === 'deathmark' && (
            <span className="story-source-badge deathmark">
              Synced from Deathmark {ticket.externalId ? `(${ticket.externalId})` : ''}
            </span>
          )}
          <button className="story-form-close" onClick={onClose}>x</button>
        </div>

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
            <div className="field-with-ai">
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Detailed description..."
                rows={5}
              />
              <button
                className="ai-assist-btn"
                onClick={handleAiAssist}
                disabled={generating || !title.trim()}
                title={title.trim() ? 'Generate with AI' : 'Enter a title first'}
              >
                {generating ? '...' : 'AI'}
              </button>
            </div>
          </label>

          <label>
            Acceptance Criteria
            <div className="field-with-ai">
              <textarea
                value={acceptanceCriteria}
                onChange={(e) => setAcceptanceCriteria(e.target.value)}
                placeholder="- [ ] Criterion 1&#10;- [ ] Criterion 2"
                rows={4}
              />
            </div>
          </label>

          {aiError && <div className="story-form-error">{aiError}</div>}

          <div className="story-form-row">
            <label>
              Priority
              <select value={priority} onChange={(e) => setPriority(e.target.value as Ticket['priority'])}>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </select>
            </label>

            <label>
              Status
              <select value={status} onChange={(e) => setStatus(e.target.value as TicketStatus)}>
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

          {otherTickets.length > 0 && (
            <label>
              Dependencies
              <div className="dependency-list">
                {otherTickets.map((t) => (
                  <label key={t.id} className="dependency-item">
                    <input
                      type="checkbox"
                      checked={dependsOn.includes(t.id)}
                      onChange={() => toggleDependency(t.id)}
                    />
                    {t.title}
                  </label>
                ))}
              </div>
            </label>
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
