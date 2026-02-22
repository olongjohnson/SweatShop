import React, { useState, useCallback, useEffect } from 'react';
import type { Conscript, Directive, Camp, ConscriptStatus } from '../../shared/types';
import type { DragState, DropHandlers } from '../hooks/useBoardDragDrop';

const STATUS_LABELS: Record<ConscriptStatus, { label: string; color: string }> = {
  IDLE: { label: 'Idle', color: 'var(--text-muted)' },
  ASSIGNED: { label: 'Assigned', color: 'var(--accent)' },
  BRANCHING: { label: 'Branching', color: 'var(--accent)' },
  DEVELOPING: { label: 'Developing', color: 'var(--warning)' },
  NEEDS_INPUT: { label: 'Needs Input', color: 'var(--warning)' },
  PROVISIONING: { label: 'Provisioning', color: 'var(--accent)' },
  QA_READY: { label: 'QA Ready', color: 'var(--accent-secondary)' },
  MERGING: { label: 'Merging', color: 'var(--success)' },
  REWORK: { label: 'Rework', color: 'var(--warning)' },
  ERROR: { label: 'Error', color: 'var(--error)' },
};

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
}

interface Props {
  conscripts: Conscript[];
  directives: Directive[];
  camps: Camp[];
  onRefresh: () => void;
  onAddConscript: () => void;
  onCloseConscript: (id: string) => void;
  dragHandlers: DropHandlers;
  dragState: DragState;
}

export default function BoardConscriptColumn({ conscripts, directives, camps, onRefresh, onAddConscript, onCloseConscript, dragHandlers, dragState }: Props) {
  const [assignState, setAssignState] = useState<Record<string, {
    directiveId: string;
    campId: string;
  }>>({});
  const [busyConscripts, setBusyConscripts] = useState<Set<string>>(new Set());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [dropHoverId, setDropHoverId] = useState<string | null>(null);
  const [allowSharedCamps, setAllowSharedCamps] = useState(false);
  const [maxConscriptsPerCamp, setMaxConscriptsPerCamp] = useState(3);

  useEffect(() => {
    window.sweatshop.settings.get().then((s) => {
      setAllowSharedCamps(s.campPool?.allowSharedCamps ?? false);
      setMaxConscriptsPerCamp(s.campPool?.maxConscriptsPerCamp ?? 3);
    });
  }, []);

  const availableDirectives = directives.filter(
    (t) => t.status === 'backlog' || t.status === 'ready'
  );

  const availableCamps = camps.filter((o) => {
    if (o.status === 'available') return true;
    if (allowSharedCamps && o.status === 'leased' && o.assignedConscriptIds.length < maxConscriptsPerCamp) return true;
    return false;
  });

  const getAssignState = (conscriptId: string) => {
    return assignState[conscriptId] || { directiveId: '', campId: '' };
  };

  const updateAssignState = (conscriptId: string, field: 'directiveId' | 'campId', value: string) => {
    setAssignState((prev) => ({
      ...prev,
      [conscriptId]: { ...getAssignState(conscriptId), [field]: value },
    }));
  };

  const handleStartWork = useCallback(async (conscriptId: string) => {
    const state = assignState[conscriptId];
    if (!state?.directiveId) return;

    setBusyConscripts((prev) => new Set(prev).add(conscriptId));
    setErrors((prev) => ({ ...prev, [conscriptId]: '' }));

    try {
      const directive = directives.find((t) => t.id === state.directiveId);
      if (!directive) return;

      const branchName = `conscript/${slugify(directive.title)}`;

      // Claim camp if one is selected
      let campAlias = '';
      if (state.campId) {
        const camp = camps.find((o) => o.id === state.campId);
        if (camp) {
          await window.sweatshop.camps.assignToConscript(camp.id, conscriptId);
          campAlias = camp.alias;
        }
      }

      // Build prompt
      const promptParts = [
        `# ${directive.title}`,
        '',
        directive.description,
        '',
        directive.acceptanceCriteria ? `## Acceptance Criteria\n${directive.acceptanceCriteria}` : '',
      ].filter(Boolean);

      // Include context from previous attempts
      const history = await window.sweatshop.chat.history(conscriptId);
      if (history.length > 0) {
        const contextMessages = history
          .filter((m) => m.role !== 'system' || m.content.includes('Rework') || m.content.includes('scrapped'))
          .slice(-20)
          .map((m) => `[${m.role}]: ${m.content}`)
          .join('\n');
        promptParts.push(
          '',
          '## Previous Attempt Context',
          'This directive was previously worked on. Use this context to iterate:',
          '',
          contextMessages,
        );
      }

      const settings = await window.sweatshop.settings.get();
      const workingDirectory = settings.git?.workingDirectory || '';

      await window.sweatshop.conscripts.assign(conscriptId, state.directiveId, {
        campAlias,
        branchName,
        refinedPrompt: promptParts.join('\n'),
        workingDirectory,
      });

      // Clear assign state
      setAssignState((prev) => {
        const next = { ...prev };
        delete next[conscriptId];
        return next;
      });
      onRefresh();
    } catch (err: any) {
      setErrors((prev) => ({ ...prev, [conscriptId]: err.message || 'Failed to assign' }));
    } finally {
      setBusyConscripts((prev) => {
        const next = new Set(prev);
        next.delete(conscriptId);
        return next;
      });
    }
  }, [assignState, directives, camps, onRefresh]);

  const handleChangeCamp = useCallback(async (conscriptId: string, newCampId: string) => {
    setBusyConscripts((prev) => new Set(prev).add(conscriptId));
    try {
      // Find current camp assigned to this conscript and unassign
      const currentCamp = camps.find((o) => o.assignedConscriptIds.includes(conscriptId));
      if (currentCamp) {
        await window.sweatshop.camps.unassignFromConscript(currentCamp.id, conscriptId);
      }
      // Assign new camp
      if (newCampId) {
        await window.sweatshop.camps.assignToConscript(newCampId, conscriptId);
      }
      onRefresh();
    } catch (err: any) {
      setErrors((prev) => ({ ...prev, [conscriptId]: err.message || 'Failed to change camp' }));
    } finally {
      setBusyConscripts((prev) => {
        const next = new Set(prev);
        next.delete(conscriptId);
        return next;
      });
    }
  }, [camps, onRefresh]);

  const handleStop = useCallback(async (conscriptId: string) => {
    await window.sweatshop.conscripts.stop(conscriptId);
    onRefresh();
  }, [onRefresh]);

  const isWorking = (status: ConscriptStatus) =>
    ['ASSIGNED', 'BRANCHING', 'DEVELOPING', 'REWORK', 'MERGING', 'PROVISIONING'].includes(status);

  return (
    <div className="board-column">
      <div className="board-column-header">
        <h3>Conscripts</h3>
        <div className="board-column-actions">
          <button
            className="btn-primary board-btn-sm"
            onClick={onAddConscript}
          >
            + Conscript
          </button>
        </div>
      </div>

      <div className="board-column-body">
        {conscripts.length === 0 && (
          <div className="board-empty">
            No conscripts. Click + Conscript to create one.
          </div>
        )}

        {conscripts.map((conscript) => {
          const status = STATUS_LABELS[conscript.status];
          const busy = busyConscripts.has(conscript.id);
          const error = errors[conscript.id];
          const assignedDirective = conscript.assignedDirectiveId
            ? directives.find((t) => t.id === conscript.assignedDirectiveId)
            : null;
          const assignedCamp = camps.find((o) => o.assignedConscriptIds.includes(conscript.id));

          const isDropTarget = dropHoverId === conscript.id;
          const isIdle = conscript.status === 'IDLE';

          return (
            <div
              key={conscript.id}
              className={`board-agent-card board-agent-card--${conscript.status.toLowerCase()} ${isDropTarget ? 'board-drop-target' : ''}`}
              data-entity-type="conscript"
              data-entity-id={conscript.id}
              draggable
              onDragStart={(e) => dragHandlers.onDragStart('conscript', conscript.id, e)}
              onDragEnd={dragHandlers.onDragEnd}
              onDragOver={(e) => { if (dragHandlers.canDrop('conscript', conscript.id)) { e.preventDefault(); setDropHoverId(conscript.id); } }}
              onDragEnter={(e) => { if (dragHandlers.canDrop('conscript', conscript.id)) { e.preventDefault(); setDropHoverId(conscript.id); } }}
              onDragLeave={() => setDropHoverId((prev) => prev === conscript.id ? null : prev)}
              onDrop={(e) => { dragHandlers.onDrop('conscript', conscript.id, e); setDropHoverId(null); }}
            >
              <div className="board-agent-header">
                <span className="board-agent-name">{conscript.name}</span>
                <span className="board-agent-status" style={{ color: status.color }}>
                  {status.label}
                </span>
              </div>

              {/* IDLE conscript — show assignment controls */}
              {conscript.status === 'IDLE' && (
                <div className="board-agent-assignment">
                  <select
                    className="board-agent-select"
                    value={getAssignState(conscript.id).directiveId}
                    onChange={(e) => updateAssignState(conscript.id, 'directiveId', e.target.value)}
                    disabled={busy}
                  >
                    <option value="">Select directive...</option>
                    {availableDirectives.map((t) => (
                      <option key={t.id} value={t.id}>
                        [{t.priority[0].toUpperCase()}] {t.title}
                      </option>
                    ))}
                  </select>
                  <select
                    className="board-agent-select"
                    value={getAssignState(conscript.id).campId}
                    onChange={(e) => updateAssignState(conscript.id, 'campId', e.target.value)}
                    disabled={busy}
                  >
                    <option value="">No camp</option>
                    {availableCamps.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.alias}{o.username ? ` (${o.username})` : ''}
                      </option>
                    ))}
                  </select>
                  <button
                    className="btn-primary board-btn-sm"
                    onClick={() => handleStartWork(conscript.id)}
                    disabled={busy || !getAssignState(conscript.id).directiveId}
                  >
                    {busy ? '...' : 'Start Work'}
                  </button>
                </div>
              )}

              {/* Working/QA/Error conscript — show current assignments */}
              {conscript.status !== 'IDLE' && (
                <div className="board-agent-info">
                  {assignedDirective && (
                    <div className="board-agent-info-row">
                      <span className="board-agent-info-label">Directive</span>
                      <span className="board-agent-info-value">{assignedDirective.title}</span>
                    </div>
                  )}
                  <div className="board-agent-info-row">
                    <span className="board-agent-info-label">Camp</span>
                    {assignedCamp ? (
                      <span className="board-agent-info-value">{assignedCamp.alias}</span>
                    ) : (
                      <span className="board-agent-info-value board-agent-info-none">none</span>
                    )}
                  </div>

                  {/* Change camp dropdown — available for working conscripts */}
                  {(isWorking(conscript.status) || conscript.status === 'NEEDS_INPUT') && (
                    <div className="board-agent-change-org">
                      <select
                        className="board-agent-select"
                        value=""
                        onChange={(e) => handleChangeCamp(conscript.id, e.target.value)}
                        disabled={busy}
                      >
                        <option value="">Change camp...</option>
                        {camps
                          .filter((o) => o.status === 'available' || o.assignedConscriptIds.includes(conscript.id))
                          .map((o) => (
                            <option key={o.id} value={o.id}>
                              {o.alias}{o.assignedConscriptIds.includes(conscript.id) ? ' (current)' : ''}
                            </option>
                          ))}
                      </select>
                    </div>
                  )}
                </div>
              )}

              {/* Actions */}
              <div className="board-agent-actions">
                {conscript.status === 'QA_READY' && (
                  <span className="board-agent-hint">Review in dashboard</span>
                )}
                {conscript.status === 'ERROR' && (
                  <>
                    <button
                      className="btn-secondary board-btn-sm"
                      onClick={() => window.sweatshop.chat.send(conscript.id, 'Please retry the last action.')}
                    >
                      Retry
                    </button>
                    <button className="board-btn-danger board-btn-sm" onClick={() => handleStop(conscript.id)}>
                      Stop
                    </button>
                  </>
                )}
                {isWorking(conscript.status) && (
                  <button className="board-btn-danger board-btn-sm" onClick={() => handleStop(conscript.id)}>
                    Stop
                  </button>
                )}
                {isIdle && (
                  <button className="board-btn-danger board-btn-sm" onClick={() => onCloseConscript(conscript.id)}>
                    Delete
                  </button>
                )}
              </div>

              {error && <div className="board-agent-error">{error}</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
