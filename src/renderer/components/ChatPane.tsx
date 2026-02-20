import React, { useState, useRef, useEffect, useCallback } from 'react';
import type { ChatMessage, AgentStatus, Ticket } from '../../shared/types';

interface ChatPaneProps {
  agentId: string | null;
}

function relativeTime(timestamp: string): string {
  const diff = Date.now() - new Date(timestamp).getTime();
  const secs = Math.floor(diff / 1000);
  if (secs < 10) return 'just now';
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function renderContent(text: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  const lines = text.split('\n');

  let inCodeBlock = false;
  let codeBlockLines: string[] = [];

  lines.forEach((line, lineIdx) => {
    if (line.startsWith('```')) {
      if (inCodeBlock) {
        parts.push(
          <pre key={`cb-${lineIdx}`} className="chat-code-block">
            <code>{codeBlockLines.join('\n')}</code>
          </pre>
        );
        codeBlockLines = [];
        inCodeBlock = false;
      } else {
        inCodeBlock = true;
      }
      return;
    }

    if (inCodeBlock) {
      codeBlockLines.push(line);
      return;
    }

    const formatted = line
      .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
      .replace(/`(.+?)`/g, '<code class="chat-inline-code">$1</code>');

    if (lineIdx > 0) parts.push(<br key={`br-${lineIdx}`} />);
    parts.push(
      <span
        key={`ln-${lineIdx}`}
        dangerouslySetInnerHTML={{ __html: formatted }}
      />
    );
  });

  if (inCodeBlock && codeBlockLines.length > 0) {
    parts.push(
      <pre key="cb-end" className="chat-code-block">
        <code>{codeBlockLines.join('\n')}</code>
      </pre>
    );
  }

  return parts;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
}

function TicketPicker({ agentId, onAssigned }: { agentId: string; onAssigned: () => void }) {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [selectedTicket, setSelectedTicket] = useState<string>('');
  const [assigning, setAssigning] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    window.sweatshop.tickets.list().then((all) => {
      const available = all.filter(
        (t) => t.status === 'backlog' || t.status === 'ready'
      );
      setTickets(available);
    });
  }, []);

  const handleAssign = async () => {
    if (!selectedTicket) return;
    setAssigning(true);
    setError('');

    try {
      const ticket = tickets.find((t) => t.id === selectedTicket);
      if (!ticket) return;

      const branchName = `agent/${slugify(ticket.title)}`;
      const prompt = [
        `# ${ticket.title}`,
        '',
        ticket.description,
        '',
        ticket.acceptanceCriteria ? `## Acceptance Criteria\n${ticket.acceptanceCriteria}` : '',
      ].filter(Boolean).join('\n');

      const settings = await window.sweatshop.settings.get();
      const workingDirectory = settings.git?.workingDirectory || '';

      await window.sweatshop.agents.assign(agentId, selectedTicket, {
        orgAlias: '',
        branchName,
        refinedPrompt: prompt,
        workingDirectory,
      });

      onAssigned();
    } catch (err: any) {
      setError(err.message || 'Failed to assign ticket');
    } finally {
      setAssigning(false);
    }
  };

  return (
    <div className="ticket-picker">
      <div className="ticket-picker-title">Assign a ticket to start working</div>
      {tickets.length === 0 ? (
        <div className="ticket-picker-empty">
          No tickets available. Create one in Stories first.
        </div>
      ) : (
        <>
          <div className="ticket-picker-list">
            {tickets.map((t) => (
              <button
                key={t.id}
                className={`ticket-picker-item ${selectedTicket === t.id ? 'selected' : ''}`}
                onClick={() => setSelectedTicket(t.id)}
              >
                <span className={`story-status-dot`} style={{
                  background: t.priority === 'critical' ? 'var(--error)' :
                    t.priority === 'high' ? 'var(--warning)' :
                    t.priority === 'medium' ? 'var(--accent)' : 'var(--text-muted)',
                }} />
                <div className="ticket-picker-info">
                  <div className="ticket-picker-name">{t.title}</div>
                  <div className="ticket-picker-meta">
                    {t.priority} · {t.labels.length > 0 ? t.labels.join(', ') : 'no labels'}
                  </div>
                </div>
              </button>
            ))}
          </div>
          {error && <div className="story-form-error">{error}</div>}
          <button
            className="btn-primary ticket-picker-assign"
            onClick={handleAssign}
            disabled={!selectedTicket || assigning}
          >
            {assigning ? 'Assigning...' : 'Start Work'}
          </button>
        </>
      )}
    </div>
  );
}

export default function ChatPane({ agentId }: ChatPaneProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [agentStatus, setAgentStatus] = useState<AgentStatus>('IDLE');
  const [input, setInput] = useState('');
  const [rejectFeedback, setRejectFeedback] = useState('');
  const [showRejectInput, setShowRejectInput] = useState(false);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [hasNewMessages, setHasNewMessages] = useState(false);

  const messagesRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Load chat history when agentId changes
  useEffect(() => {
    if (!agentId) {
      setMessages([]);
      setAgentStatus('IDLE');
      return;
    }

    let cancelled = false;

    Promise.all([
      window.sweatshop.chat.history(agentId),
      window.sweatshop.agents.get(agentId),
    ]).then(([history, agent]) => {
      if (cancelled) return;
      setMessages(history);
      if (agent) setAgentStatus(agent.status);
      setIsAtBottom(true);
      setHasNewMessages(false);
    });

    return () => { cancelled = true; };
  }, [agentId]);

  // Subscribe to IPC events
  useEffect(() => {
    if (!agentId) return;

    const handleNewMessage = (msg: ChatMessage) => {
      if (msg.agentId !== agentId) return;
      setMessages((prev) => [...prev, msg]);
      if (!isAtBottom) {
        setHasNewMessages(true);
      }
    };

    const handleStatusChanged = (data: { agentId: string; status: AgentStatus }) => {
      if (data.agentId !== agentId) return;
      setAgentStatus(data.status);
    };

    window.sweatshop.chat.onMessage(handleNewMessage);
    window.sweatshop.agents.onStatusChanged(handleStatusChanged);
  }, [agentId, isAtBottom]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (isAtBottom && messagesRef.current) {
      messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
    }
  }, [messages, isAtBottom]);

  // Focus input when NEEDS_INPUT
  useEffect(() => {
    if (agentStatus === 'NEEDS_INPUT' && inputRef.current) {
      inputRef.current.focus();
    }
  }, [agentStatus]);

  const handleScroll = useCallback(() => {
    if (!messagesRef.current) return;
    const el = messagesRef.current;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    setIsAtBottom(atBottom);
    if (atBottom) setHasNewMessages(false);
  }, []);

  const scrollToBottom = useCallback(() => {
    if (messagesRef.current) {
      messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
    }
    setIsAtBottom(true);
    setHasNewMessages(false);
  }, []);

  const handleSend = useCallback(async () => {
    if (!agentId || !input.trim()) return;
    const text = input.trim();
    setInput('');
    await window.sweatshop.chat.send(agentId, text);
  }, [agentId, input]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  const handleApprove = useCallback(async () => {
    if (!agentId) return;
    const confirmed = window.confirm(
      'This will merge the agent\'s work into the base branch. Are you sure?'
    );
    if (!confirmed) return;
    await window.sweatshop.agents.approve(agentId);
  }, [agentId]);

  const handleReject = useCallback(async () => {
    if (!agentId || !rejectFeedback.trim()) return;
    await window.sweatshop.agents.reject(agentId, rejectFeedback.trim());
    setRejectFeedback('');
    setShowRejectInput(false);
  }, [agentId, rejectFeedback]);

  const handleStop = useCallback(async () => {
    if (!agentId) return;
    await window.sweatshop.agents.stop(agentId);
  }, [agentId]);

  const isInputDisabled = !agentId || agentStatus === 'IDLE';

  const placeholderText = (() => {
    switch (agentStatus) {
      case 'NEEDS_INPUT': return 'The agent is waiting for your response...';
      case 'QA_READY': return 'Add a note or use the buttons above...';
      case 'IDLE': return 'No active conversation';
      default: return 'Send a message to the agent...';
    }
  })();

  return (
    <div className="chat-pane">
      {/* Messages area */}
      <div className="chat-messages" ref={messagesRef} onScroll={handleScroll}>
        {agentId && agentStatus === 'IDLE' && messages.length === 0 ? (
          <TicketPicker
            agentId={agentId}
            onAssigned={() => {/* status change will update via IPC */}}
          />
        ) : messages.length === 0 ? (
          <div className="chat-empty">
            {agentId ? 'No messages yet' : 'Select an agent to start chatting'}
          </div>
        ) : null}
        {messages.map((msg) => (
          <div key={msg.id} className={`chat-message ${msg.role}`}>
            {msg.role !== 'system' && (
              <div className="chat-message-header">
                <span className="chat-avatar">{msg.role === 'agent' ? 'A' : 'U'}</span>
                <span className="chat-role-label">
                  {msg.role === 'agent' ? 'Agent' : 'You'}
                </span>
                <span className="chat-timestamp">{relativeTime(msg.timestamp)}</span>
              </div>
            )}
            <div className="chat-message-content">
              {msg.role === 'system' ? (
                <em>{msg.content}</em>
              ) : (
                renderContent(msg.content)
              )}
            </div>
            {msg.role === 'system' && (
              <span className="chat-timestamp system-ts">{relativeTime(msg.timestamp)}</span>
            )}
          </div>
        ))}
        {(agentStatus === 'DEVELOPING' || agentStatus === 'REWORK' || agentStatus === 'BRANCHING' || agentStatus === 'MERGING' || agentStatus === 'ASSIGNED') && (
          <div className="chat-thinking">
            <span className="chat-thinking-dots">
              <span /><span /><span />
            </span>
            <span className="chat-thinking-label">
              {agentStatus === 'BRANCHING' ? 'Creating branch...' :
               agentStatus === 'ASSIGNED' ? 'Setting up...' :
               agentStatus === 'MERGING' ? 'Merging...' :
               agentStatus === 'REWORK' ? 'Reworking...' :
               'Agent is working...'}
            </span>
          </div>
        )}
      </div>

      {/* New messages pill */}
      {hasNewMessages && (
        <button className="chat-new-messages-pill" onClick={scrollToBottom}>
          New messages
        </button>
      )}

      {/* Action bar */}
      {agentStatus === 'QA_READY' && (
        <div className="chat-action-bar qa-ready">
          <div className="chat-action-label">Development complete — QA ready</div>
          {showRejectInput ? (
            <div className="chat-reject-input">
              <textarea
                value={rejectFeedback}
                onChange={(e) => setRejectFeedback(e.target.value)}
                placeholder="Describe what needs to change..."
                rows={2}
                autoFocus
              />
              <div className="chat-reject-actions">
                <button className="btn-secondary" onClick={() => setShowRejectInput(false)}>
                  Cancel
                </button>
                <button
                  className="reject-confirm-btn"
                  onClick={handleReject}
                  disabled={!rejectFeedback.trim()}
                >
                  Send Feedback
                </button>
              </div>
            </div>
          ) : (
            <div className="chat-action-buttons">
              <button className="approve-btn" onClick={handleApprove}>Approve</button>
              <button className="reject-btn" onClick={() => setShowRejectInput(true)}>Reject</button>
            </div>
          )}
        </div>
      )}

      {agentStatus === 'NEEDS_INPUT' && (
        <div className="chat-action-bar needs-input">
          <div className="chat-action-label">Agent is waiting for your input</div>
        </div>
      )}

      {agentStatus === 'ERROR' && (
        <div className="chat-action-bar error-state">
          <div className="chat-action-label">Agent encountered an error</div>
          <div className="chat-action-buttons">
            <button className="btn-primary" onClick={() => agentId && window.sweatshop.chat.send(agentId, 'Please retry the last action.')}>
              Retry
            </button>
            <button className="reject-btn" onClick={handleStop}>Stop Agent</button>
          </div>
        </div>
      )}

      {/* Stop button for working agents */}
      {(agentStatus === 'DEVELOPING' || agentStatus === 'REWORK' || agentStatus === 'BRANCHING' || agentStatus === 'MERGING' || agentStatus === 'ASSIGNED') && (
        <div className="chat-action-bar working-state">
          <div className="chat-action-label">
            <span className="working-indicator" />
            {agentStatus === 'BRANCHING' ? 'Creating branch...' :
             agentStatus === 'ASSIGNED' ? 'Setting up agent...' :
             agentStatus === 'MERGING' ? 'Merging to base branch...' :
             agentStatus === 'REWORK' ? 'Agent is reworking...' :
             'Agent is developing...'}
          </div>
          <div className="chat-action-buttons">
            <button className="reject-btn" onClick={handleStop}>Stop Agent</button>
          </div>
        </div>
      )}

      {/* Input area */}
      <div className={`chat-input-area ${agentStatus === 'NEEDS_INPUT' ? 'highlight' : ''}`}>
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholderText}
          disabled={isInputDisabled}
          rows={1}
        />
        <button onClick={handleSend} disabled={isInputDisabled || !input.trim()}>
          Send
        </button>
      </div>
    </div>
  );
}
