import React, { useState, useEffect, useCallback } from 'react';
import type { IdentityTemplate, WorkflowTemplate } from '../../shared/types';
import IdentityCard from '../components/IdentityCard';
import IdentityForm from '../components/IdentityForm';
import WorkflowCard from '../components/WorkflowCard';
import WorkflowForm from '../components/WorkflowForm';

export default function CommissariatView() {
  const [identities, setIdentities] = useState<IdentityTemplate[]>([]);
  const [workflows, setWorkflows] = useState<WorkflowTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingIdentityId, setEditingIdentityId] = useState<string | null | 'new'>(null);
  const [editingWorkflowId, setEditingWorkflowId] = useState<string | null | 'new'>(null);

  const refresh = useCallback(async () => {
    try {
      const [idList, wfList] = await Promise.all([
        window.sweatshop.identities.list(),
        window.sweatshop.workflows.list(),
      ]);
      setIdentities(idList);
      setWorkflows(wfList);
    } catch (err) {
      console.error('CommissariatView refresh failed:', err);
    }
    setLoading(false);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const handleDeleteIdentity = useCallback(async (id: string) => {
    await window.sweatshop.identities.delete(id);
    refresh();
  }, [refresh]);

  const handleDeleteWorkflow = useCallback(async (id: string) => {
    await window.sweatshop.workflows.delete(id);
    refresh();
  }, [refresh]);

  const handleIdentitySave = useCallback(() => {
    setEditingIdentityId(null);
    refresh();
  }, [refresh]);

  const handleWorkflowSave = useCallback(() => {
    setEditingWorkflowId(null);
    refresh();
  }, [refresh]);

  if (loading) {
    return (
      <div className="commissariat-view">
        <div className="commissariat-loading">
          <div className="settings-auth-login-spinner" />
          Loading...
        </div>
      </div>
    );
  }

  return (
    <div className="commissariat-view">
      {/* Identities Section */}
      <div className="commissariat-section">
        <div className="commissariat-section-header">
          <h2>Identities</h2>
          <button className="btn-primary" onClick={() => setEditingIdentityId('new')}>
            + Identity
          </button>
        </div>

        {identities.length === 0 ? (
          <div className="commissariat-empty">
            <div className="commissariat-empty-icon">
              <svg viewBox="0 0 24 24" fill="currentColor" width="48" height="48">
                <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
              </svg>
            </div>
            <p>No identities yet. Create one to define an agent persona.</p>
          </div>
        ) : (
          <div className="commissariat-grid">
            {identities.map((id) => (
              <IdentityCard
                key={id.id}
                identity={id}
                onEdit={setEditingIdentityId}
                onDelete={handleDeleteIdentity}
              />
            ))}
          </div>
        )}
      </div>

      {/* Workflows Section */}
      <div className="commissariat-section">
        <div className="commissariat-section-header">
          <h2>Workflows</h2>
          <button className="btn-primary" onClick={() => setEditingWorkflowId('new')}>
            + Workflow
          </button>
        </div>

        {workflows.length === 0 ? (
          <div className="commissariat-empty">
            <div className="commissariat-empty-icon">
              <svg viewBox="0 0 24 24" fill="currentColor" width="48" height="48">
                <path d="M3 13h2v-2H3v2zm0 4h2v-2H3v2zm0-8h2V7H3v2zm4 4h14v-2H7v2zm0 4h14v-2H7v2zM7 7v2h14V7H7z" />
              </svg>
            </div>
            <p>No workflows yet. Create one to chain identities into multi-stage pipelines.</p>
          </div>
        ) : (
          <div className="commissariat-grid">
            {workflows.map((wf) => (
              <WorkflowCard
                key={wf.id}
                workflow={wf}
                onEdit={setEditingWorkflowId}
                onDelete={handleDeleteWorkflow}
              />
            ))}
          </div>
        )}
      </div>

      {/* Identity Form Modal */}
      {editingIdentityId !== null && (
        <IdentityForm
          identityId={editingIdentityId === 'new' ? null : editingIdentityId}
          onSave={handleIdentitySave}
          onCancel={() => setEditingIdentityId(null)}
        />
      )}

      {/* Workflow Form Modal */}
      {editingWorkflowId !== null && (
        <WorkflowForm
          workflowId={editingWorkflowId === 'new' ? null : editingWorkflowId}
          onSave={handleWorkflowSave}
          onCancel={() => setEditingWorkflowId(null)}
        />
      )}
    </div>
  );
}
