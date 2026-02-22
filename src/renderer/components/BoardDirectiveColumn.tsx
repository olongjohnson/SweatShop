import React, { useState, useMemo } from 'react';
import type { Directive, DirectiveStatus, DirectiveSource, Conscript } from '../../shared/types';
import type { DragState, DropHandlers } from '../hooks/useBoardDragDrop';

const STATUS_COLORS: Record<DirectiveStatus, string> = {
  backlog: 'var(--text-muted)',
  ready: 'var(--accent)',
  in_progress: 'var(--warning)',
  qa_review: 'var(--accent-secondary)',
  approved: 'var(--success)',
  merged: 'var(--success)',
  rejected: 'var(--error)',
};

const PRIORITY_LABELS: Record<string, { label: string; color: string }> = {
  critical: { label: 'CRITICAL', color: 'var(--error)' },
  high: { label: 'HIGH', color: 'var(--warning)' },
  medium: { label: 'MED', color: 'var(--accent-secondary)' },
  low: { label: 'LOW', color: 'var(--text-muted)' },
};

interface Props {
  directives: Directive[];
  conscripts: Conscript[];
  onCreateDirective: () => void;
  onEditDirective: (directive: Directive) => void;
  onRefresh: () => void;
  dragHandlers: DropHandlers;
  dragState: DragState;
}

export default function BoardDirectiveColumn({ directives, conscripts, onCreateDirective, onEditDirective, onRefresh, dragHandlers, dragState }: Props) {
  const [statusFilter, setStatusFilter] = useState<DirectiveStatus | ''>('');
  const [sourceFilter, setSourceFilter] = useState<DirectiveSource | ''>('');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [syncing, setSyncing] = useState(false);
  const [dropHoverId, setDropHoverId] = useState<string | null>(null);
  const [detailDirective, setDetailDirective] = useState<Directive | null>(null);

  const filtered = useMemo(() => {
    return directives.filter((t) => {
      if (statusFilter && t.status !== statusFilter) return false;
      if (sourceFilter && t.source !== sourceFilter) return false;
      if (search && !t.title.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [directives, statusFilter, sourceFilter, search]);

  const toggleSelect = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selected.size === filtered.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map((t) => t.id)));
    }
  };

  const handleDispatch = async () => {
    if (selected.size === 0) return;
    await window.sweatshop.orchestrator.loadDirectives([...selected]);
    await window.sweatshop.orchestrator.start();
    setSelected(new Set());
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      await window.sweatshop.deathmark.sync();
      onRefresh();
    } catch (err) {
      console.error('Deathmark sync failed:', err);
    } finally {
      setSyncing(false);
    }
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await window.sweatshop.directives.delete(id);
    setSelected((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    onRefresh();
  };

  // Build conscript lookup for showing assigned conscript names
  const conscriptMap = useMemo(() => {
    const map = new Map<string, string>();
    conscripts.forEach((a) => {
      if (a.assignedDirectiveId) map.set(a.assignedDirectiveId, a.name);
    });
    return map;
  }, [conscripts]);

  return (
    <div className="board-column">
      <div className="board-column-header">
        <h3>Directives</h3>
        <div className="board-column-actions">
          {selected.size > 0 && (
            <button className="btn-primary board-btn-sm" onClick={handleDispatch}>
              Dispatch {selected.size}
            </button>
          )}
          <button className="btn-primary board-btn-sm" onClick={onCreateDirective}>+ New</button>
          <button className="btn-secondary board-btn-sm" onClick={handleSync} disabled={syncing}>
            {syncing ? '...' : 'Sync'}
          </button>
        </div>
      </div>

      <div className="board-filters">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as DirectiveStatus | '')}
        >
          <option value="">All Status</option>
          <option value="backlog">Backlog</option>
          <option value="ready">Ready</option>
          <option value="in_progress">In Progress</option>
          <option value="qa_review">QA Review</option>
          <option value="approved">Approved</option>
          <option value="merged">Merged</option>
          <option value="rejected">Rejected</option>
        </select>

        <select
          value={sourceFilter}
          onChange={(e) => setSourceFilter(e.target.value as DirectiveSource | '')}
        >
          <option value="">All Sources</option>
          <option value="manual">Manual</option>
          <option value="deathmark">Deathmark</option>
        </select>

        <input
          type="text"
          placeholder="Search..."
          className="board-search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        {filtered.length > 0 && (
          <button className="btn-secondary board-btn-sm" onClick={toggleSelectAll}>
            {selected.size === filtered.length ? 'None' : 'All'}
          </button>
        )}
      </div>

      <div className="board-column-body">
        {filtered.length === 0 && (
          <div className="board-empty">
            No directives found. Create one or sync from Deathmark.
          </div>
        )}
        {filtered.map((directive) => {
          const assignedConscript = conscriptMap.get(directive.id);
          const isDraggable = directive.status === 'backlog' || directive.status === 'ready';
          const isDropTarget = dropHoverId === directive.id;
          return (
            <div
              key={directive.id}
              className={`story-row ${selected.has(directive.id) ? 'selected' : ''} ${isDropTarget ? 'board-drop-target' : ''}`}
              data-entity-type="directive"
              data-entity-id={directive.id}
              draggable={isDraggable}
              onDragStart={isDraggable ? (e) => dragHandlers.onDragStart('directive', directive.id, e) : undefined}
              onDragEnd={dragHandlers.onDragEnd}
              onDragOver={(e) => { if (dragHandlers.canDrop('directive', directive.id)) { e.preventDefault(); setDropHoverId(directive.id); } }}
              onDragEnter={(e) => { if (dragHandlers.canDrop('directive', directive.id)) { e.preventDefault(); setDropHoverId(directive.id); } }}
              onDragLeave={() => setDropHoverId((prev) => prev === directive.id ? null : prev)}
              onDrop={(e) => { dragHandlers.onDrop('directive', directive.id, e); setDropHoverId(null); }}
              onClick={() => onEditDirective(directive)}
            >
              <div className="story-row-left">
                <input
                  type="checkbox"
                  className="story-checkbox"
                  checked={selected.has(directive.id)}
                  onClick={(e) => toggleSelect(directive.id, e)}
                  onChange={() => {}}
                />
                <span
                  className="story-status-dot"
                  style={{ background: STATUS_COLORS[directive.status] }}
                />
                <div className="story-row-info">
                  <div className="story-row-title">{directive.title}</div>
                  <div className="story-row-meta">
                    {directive.description.slice(0, 60)}{directive.description.length > 60 ? '...' : ''}
                    <span className={`story-source-badge ${directive.source}`}>
                      {directive.source === 'deathmark' ? 'DM' : 'M'}
                    </span>
                    {assignedConscript && (
                      <span className="board-assigned-badge">{assignedConscript}</span>
                    )}
                    {directive.labels.slice(0, 2).map((l) => (
                      <span key={l} className="story-label">{l}</span>
                    ))}
                  </div>
                </div>
              </div>
              <div className="story-row-right">
                <span
                  className="story-priority-badge"
                  style={{ color: PRIORITY_LABELS[directive.priority]?.color }}
                >
                  {PRIORITY_LABELS[directive.priority]?.label}
                </span>
                <button
                  className="story-info-btn"
                  onClick={(e) => { e.stopPropagation(); setDetailDirective(directive); }}
                  title="View details"
                >
                  i
                </button>
                <button
                  className="story-delete-btn"
                  onClick={(e) => handleDelete(directive.id, e)}
                  title="Delete"
                >
                  x
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {detailDirective && (() => {
        const assignedName = conscriptMap.get(detailDirective.id);
        const depTitles = detailDirective.dependsOn
          .map((depId) => directives.find((d) => d.id === depId)?.title)
          .filter(Boolean);

        return (
          <div className="directive-detail-overlay" onClick={() => setDetailDirective(null)}>
            <div className="directive-detail-modal" onClick={(e) => e.stopPropagation()}>
              <div className="directive-detail-header">
                <h3>{detailDirective.title}</h3>
                <button className="directive-detail-close" onClick={() => setDetailDirective(null)}>&times;</button>
              </div>
              <div className="directive-detail-body">
                <div className="directive-detail-badges">
                  <span className="directive-detail-status" style={{ background: STATUS_COLORS[detailDirective.status] }}>
                    {detailDirective.status.replace('_', ' ')}
                  </span>
                  <span className="story-priority-badge" style={{ color: PRIORITY_LABELS[detailDirective.priority]?.color }}>
                    {PRIORITY_LABELS[detailDirective.priority]?.label}
                  </span>
                  <span className={`story-source-badge ${detailDirective.source}`}>
                    {detailDirective.source === 'deathmark' ? 'Deathmark' : 'Manual'}
                  </span>
                </div>

                {detailDirective.description && (
                  <div className="directive-detail-section">
                    <div className="directive-detail-label">Description</div>
                    <div className="directive-detail-text">{detailDirective.description}</div>
                  </div>
                )}

                {detailDirective.acceptanceCriteria && (
                  <div className="directive-detail-section">
                    <div className="directive-detail-label">Acceptance Criteria</div>
                    <div className="directive-detail-text">{detailDirective.acceptanceCriteria}</div>
                  </div>
                )}

                {detailDirective.labels.length > 0 && (
                  <div className="directive-detail-section">
                    <div className="directive-detail-label">Labels</div>
                    <div className="directive-detail-tags">
                      {detailDirective.labels.map((l) => (
                        <span key={l} className="story-label">{l}</span>
                      ))}
                    </div>
                  </div>
                )}

                {assignedName && (
                  <div className="directive-detail-section">
                    <div className="directive-detail-label">Assigned Conscript</div>
                    <div className="directive-detail-value">{assignedName}</div>
                  </div>
                )}

                {depTitles.length > 0 && (
                  <div className="directive-detail-section">
                    <div className="directive-detail-label">Dependencies</div>
                    <div className="directive-detail-text">{depTitles.join(', ')}</div>
                  </div>
                )}

                <div className="directive-detail-section">
                  <div className="directive-detail-label">Timestamps</div>
                  <div className="directive-detail-value">
                    Created: {new Date(detailDirective.createdAt).toLocaleString()}
                    <br />
                    Updated: {new Date(detailDirective.updatedAt).toLocaleString()}
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
