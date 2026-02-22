import React, { useState, useEffect, useCallback } from 'react';
import type { Directive, QaChecklistItem } from '../../shared/types';

interface QaChecklistSidebarProps {
  conscriptId: string;
  directive: Directive | null;
}

export default function QaChecklistSidebar({ conscriptId, directive }: QaChecklistSidebarProps) {
  const [checklist, setChecklist] = useState<QaChecklistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [descExpanded, setDescExpanded] = useState(false);

  // Poll for checklist until it arrives (generation is async)
  useEffect(() => {
    let mounted = true;
    let pollId: ReturnType<typeof setInterval>;

    const load = async () => {
      try {
        const items = await window.sweatshop.runs.getQaChecklist(conscriptId);
        if (!mounted) return;
        if (items.length > 0) {
          setChecklist(items);
          setLoading(false);
          clearInterval(pollId);
        }
      } catch { /* not ready */ }
    };

    load();
    pollId = setInterval(load, 3000);

    return () => { mounted = false; clearInterval(pollId); };
  }, [conscriptId]);

  const toggleItem = useCallback((itemId: string) => {
    setChecklist((prev) => {
      const updated = prev.map((item) =>
        item.id === itemId ? { ...item, checked: !item.checked } : item
      );
      window.sweatshop.runs.updateQaChecklist(conscriptId, updated);
      return updated;
    });
  }, [conscriptId]);

  const checkedCount = checklist.filter((i) => i.checked).length;

  return (
    <div className="qa-sidebar">
      {/* Directive Summary */}
      {directive && (
        <div className="qa-sidebar-directive">
          <div className="qa-sidebar-title">{directive.title}</div>
          <div className="qa-sidebar-meta">
            <span className={`qa-sidebar-priority qa-sidebar-priority--${directive.priority}`}>
              {directive.priority}
            </span>
            {directive.labels.map((l) => (
              <span key={l} className="qa-sidebar-label">{l}</span>
            ))}
          </div>
          {directive.description && (
            <div className={`qa-sidebar-desc ${descExpanded ? 'expanded' : ''}`}>
              <div className="qa-sidebar-desc-text">{directive.description}</div>
              {directive.description.length > 150 && (
                <button
                  className="qa-sidebar-desc-toggle"
                  onClick={() => setDescExpanded(!descExpanded)}
                >
                  {descExpanded ? 'Show less' : 'Show more'}
                </button>
              )}
            </div>
          )}
          {directive.acceptanceCriteria && (
            <div className="qa-sidebar-ac">
              <div className="qa-sidebar-ac-label">Acceptance Criteria</div>
              <div className="qa-sidebar-ac-text">{directive.acceptanceCriteria}</div>
            </div>
          )}
        </div>
      )}

      {/* QA Checklist */}
      <div className="qa-checklist">
        <div className="qa-checklist-header">
          <span>QA Checklist</span>
          {checklist.length > 0 && (
            <span className="qa-checklist-progress">
              {checkedCount}/{checklist.length}
            </span>
          )}
        </div>

        {loading ? (
          <div className="qa-checklist-loading">
            <div className="settings-auth-login-spinner" />
            Generating checklist...
          </div>
        ) : (
          <div className="qa-checklist-items">
            {checklist.map((item) => (
              <label
                key={item.id}
                className={`qa-checklist-item ${item.checked ? 'checked' : ''}`}
              >
                <input
                  type="checkbox"
                  checked={item.checked}
                  onChange={() => toggleItem(item.id)}
                />
                <span className="qa-checklist-label">{item.label}</span>
              </label>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
