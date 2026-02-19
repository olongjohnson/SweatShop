import React, { useState, useEffect, useMemo } from 'react';
import type { Ticket, TicketStatus, TicketSource } from '../../shared/types';
import StoryForm from '../components/StoryForm';

const STATUS_COLORS: Record<TicketStatus, string> = {
  backlog: 'var(--text-muted)',
  ready: 'var(--accent)',
  in_progress: 'var(--warning)',
  qa_review: '#ce9178',
  approved: 'var(--success)',
  merged: 'var(--success)',
  rejected: 'var(--error)',
};

const PRIORITY_LABELS: Record<string, { label: string; color: string }> = {
  critical: { label: 'CRITICAL', color: 'var(--error)' },
  high: { label: 'HIGH', color: '#ce9178' },
  medium: { label: 'MED', color: 'var(--warning)' },
  low: { label: 'LOW', color: 'var(--text-muted)' },
};

export default function StoriesView() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [statusFilter, setStatusFilter] = useState<TicketStatus | ''>('');
  const [sourceFilter, setSourceFilter] = useState<TicketSource | ''>('');
  const [search, setSearch] = useState('');
  const [editingTicket, setEditingTicket] = useState<Ticket | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const loadTickets = async () => {
    const list = await window.sweatshop.tickets.list();
    setTickets(list);
  };

  useEffect(() => {
    loadTickets();
  }, []);

  const filtered = useMemo(() => {
    return tickets.filter((t) => {
      if (statusFilter && t.status !== statusFilter) return false;
      if (sourceFilter && t.source !== sourceFilter) return false;
      if (search && !t.title.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [tickets, statusFilter, sourceFilter, search]);

  const handleCreate = () => {
    setEditingTicket(null);
    setShowForm(true);
  };

  const handleEdit = (ticket: Ticket) => {
    setEditingTicket(ticket);
    setShowForm(true);
  };

  const handleFormClose = () => {
    setShowForm(false);
    setEditingTicket(null);
    loadTickets();
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      await window.sweatshop.deathmark.sync();
      await loadTickets();
    } catch (err: unknown) {
      console.error('Deathmark sync failed:', err);
    } finally {
      setSyncing(false);
    }
  };

  const handleDelete = async (id: string) => {
    await window.sweatshop.tickets.delete(id);
    loadTickets();
  };

  return (
    <div className="stories-view">
      {showForm && (
        <StoryForm
          ticket={editingTicket}
          allTickets={tickets}
          onClose={handleFormClose}
        />
      )}

      <div className="stories-header">
        <h2>Stories</h2>
        <div className="stories-header-actions">
          <button className="btn-primary" onClick={handleCreate}>+ New Story</button>
          <button className="btn-secondary" onClick={handleSync} disabled={syncing}>
            {syncing ? 'Syncing...' : 'Sync'}
          </button>
        </div>
      </div>

      <div className="stories-filters">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as TicketStatus | '')}
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
          onChange={(e) => setSourceFilter(e.target.value as TicketSource | '')}
        >
          <option value="">All Sources</option>
          <option value="manual">Manual</option>
          <option value="deathmark">Deathmark</option>
        </select>

        <input
          type="text"
          placeholder="Search stories..."
          className="stories-search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="stories-list">
        {filtered.length === 0 && (
          <div className="stories-empty">
            No stories found. Create one or sync from Deathmark.
          </div>
        )}
        {filtered.map((ticket) => (
          <div
            key={ticket.id}
            className="story-row"
            onClick={() => handleEdit(ticket)}
          >
            <div className="story-row-left">
              <span
                className="story-status-dot"
                style={{ background: STATUS_COLORS[ticket.status] }}
              />
              <div className="story-row-info">
                <div className="story-row-title">{ticket.title}</div>
                <div className="story-row-meta">
                  {ticket.description.slice(0, 80)}{ticket.description.length > 80 ? '...' : ''}
                  <span className={`story-source-badge ${ticket.source}`}>
                    {ticket.source === 'deathmark' ? 'Deathmark' : 'Manual'}
                  </span>
                  {ticket.labels.map((l) => (
                    <span key={l} className="story-label">{l}</span>
                  ))}
                </div>
              </div>
            </div>
            <div className="story-row-right">
              <span
                className="story-priority-badge"
                style={{ color: PRIORITY_LABELS[ticket.priority]?.color }}
              >
                {PRIORITY_LABELS[ticket.priority]?.label}
              </span>
              <button
                className="story-delete-btn"
                onClick={(e) => { e.stopPropagation(); handleDelete(ticket.id); }}
                title="Delete"
              >
                x
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
