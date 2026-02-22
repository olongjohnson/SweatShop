import React from 'react';
import type { WorkflowTemplate, WorkflowStageType } from '../../shared/types';

interface WorkflowCardProps {
  workflow: WorkflowTemplate;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
}

const STAGE_TYPE_LABELS: Record<WorkflowStageType, string> = {
  refine: 'Refine',
  execute: 'Execute',
  review: 'Review',
  human: 'Human',
};

const STAGE_TYPE_COLORS: Record<WorkflowStageType, string> = {
  refine: '#7c3aed',
  execute: '#059669',
  review: '#d97706',
  human: '#2563eb',
};

export default function WorkflowCard({ workflow, onEdit, onDelete }: WorkflowCardProps) {
  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm(`Delete workflow "${workflow.name}"?`)) {
      onDelete(workflow.id);
    }
  };

  const sortedStages = [...workflow.stages].sort((a, b) => a.order - b.order);

  return (
    <div className="workflow-card" onClick={() => onEdit(workflow.id)}>
      <div className="workflow-card-header">
        <div className="workflow-card-name">{workflow.name}</div>
        <button
          className="workflow-card-delete"
          onClick={handleDelete}
          title="Delete"
        >
          &times;
        </button>
      </div>
      {workflow.description && (
        <div className="workflow-card-desc">{workflow.description}</div>
      )}
      <div className="workflow-card-pipeline">
        {sortedStages.map((stage, i) => (
          <React.Fragment key={stage.id}>
            {i > 0 && <span className="workflow-card-arrow">&rarr;</span>}
            <span
              className="workflow-card-stage-badge"
              style={{ borderColor: STAGE_TYPE_COLORS[stage.type] }}
              title={stage.inputDescription || STAGE_TYPE_LABELS[stage.type]}
            >
              {STAGE_TYPE_LABELS[stage.type]}
            </span>
          </React.Fragment>
        ))}
        {sortedStages.length === 0 && (
          <span className="workflow-card-empty-stages">No stages</span>
        )}
      </div>
    </div>
  );
}
