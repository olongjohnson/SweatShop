import React from 'react';
import type { IdentityTemplate } from '../../shared/types';

interface IdentityCardProps {
  identity: IdentityTemplate;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
}

const MODEL_LABELS: Record<string, string> = {
  sonnet: 'Sonnet',
  opus: 'Opus',
  haiku: 'Haiku',
};

export default function IdentityCard({ identity, onEdit, onDelete }: IdentityCardProps) {
  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm(`Delete identity "${identity.name}"?`)) {
      onDelete(identity.id);
    }
  };

  return (
    <div className="identity-card" onClick={() => onEdit(identity.id)}>
      <div className="identity-card-portrait">
        {identity.portrait ? (
          <img src={identity.portrait} alt={identity.name} />
        ) : (
          <div className="identity-card-silhouette">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
            </svg>
          </div>
        )}
      </div>
      <div className="identity-card-body">
        <div className="identity-card-name">{identity.name}</div>
        <div className="identity-card-badges">
          {identity.role && (
            <span className="identity-card-role">{identity.role}</span>
          )}
          <span className={`identity-card-model identity-card-model--${identity.model}`}>
            {MODEL_LABELS[identity.model] || identity.model}
          </span>
        </div>
        {identity.goal && (
          <div className="identity-card-goal">{identity.goal}</div>
        )}
      </div>
      <div className="identity-card-actions">
        <button
          className="identity-card-delete"
          onClick={handleDelete}
          title="Delete"
        >
          &times;
        </button>
      </div>
    </div>
  );
}
