import React, { useState, useRef, useEffect, useCallback } from 'react';
import type { ChatMessage, ConscriptStatus, Directive, Camp } from '../../shared/types';

interface ChatPaneProps {
  conscriptId: string | null;
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

function DirectivePicker({ conscriptId, onAssigned }: { conscriptId: string; onAssigned: () => void }) {
  const [directives, setDirectives] = useState<Directive[]>([]);
  const [camps, setCamps] = useState<Camp[]>([]);
  const [selectedDirective, setSelectedDirective] = useState<string>('');
  const [selectedCamp, setSelectedCamp] = useState<string>('');
  const [assigning, setAssigning] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    window.sweatshop.directives.list().then((all) => {
      const available = all.filter(
        (t) => t.status === 'backlog' || t.status === 'ready'
      );
      setDirectives(available);
    });
    window.sweatshop.camps.list().then((all) => {
      const available = all.filter((o) => o.status === 'available');
      setCamps(available);
      if (available.length > 0) setSelectedCamp(available[0].alias);
    });
  }, []);

  const handleAssign = async () => {
    if (!selectedDirective) return;
    setAssigning(true);
    setError('');

    try {
      const directive = directives.find((t) => t.id === selectedDirective);
      if (!directive) return;

      const branchName = `conscript/${slugify(directive.title)}`;

      // Claim a camp from the pool if one is selected
      let campAlias = '';
      if (selectedCamp) {
        const claimed = await window.sweatshop.camps.claim(conscriptId);
        if (claimed) {
          campAlias = claimed.alias;
        }
      }

      // Build base prompt
      const promptParts = [
        `# ${directive.title}`,
        '',
        directive.description,
        '',
        directive.acceptanceCriteria ? `## Acceptance Criteria\n${directive.acceptanceCriteria}` : '',
      ].filter(Boolean);

      // Include context from previous attempts if chat history exists
      const history = await window.sweatshop.chat.history(conscriptId);
      if (history.length > 0) {
        const contextMessages = history
          .filter((m) => m.role !== 'system' || m.content.includes('Rework') || m.content.includes('scrapped'))
          .slice(-20) // last 20 relevant messages
          .map((m) => `[${m.role}]: ${m.content}`)
          .join('\n');

        promptParts.push(
          '',
          '## Previous Attempt Context',
          'This directive was previously worked on by this conscript. Here is the conversation history from the last attempt. Use this context to avoid repeating the same mistakes and to iterate on the approach:',
          '',
          contextMessages,
        );
      }

      const prompt = promptParts.join('\n');

      const settings = await window.sweatshop.settings.get();
      const workingDirectory = settings.git?.workingDirectory || '';

      await window.sweatshop.conscripts.assign(conscriptId, selectedDirective, {
        campAlias,
        branchName,
        refinedPrompt: prompt,
        workingDirectory,
      });

      onAssigned();
    } catch (err: any) {
      setError(err.message || 'Failed to assign directive');
    } finally {
      setAssigning(false);
    }
  };

  return (
    <div className="ticket-picker">
      <div className="ticket-picker-title">Assign a directive to start working</div>
      {directives.length === 0 ? (
        <div className="ticket-picker-empty">
          No directives available. Create one in Stories first.
        </div>
      ) : (
        <>
          <div className="ticket-picker-list">
            {directives.map((t) => (
              <button
                key={t.id}
                className={`ticket-picker-item ${selectedDirective === t.id ? 'selected' : ''}`}
                onClick={() => setSelectedDirective(t.id)}
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
          <div className="ticket-picker-org">
            <label className="ticket-picker-org-label">Camp</label>
            {camps.length > 0 ? (
              <select
                className="ticket-picker-org-select"
                value={selectedCamp}
                onChange={(e) => setSelectedCamp(e.target.value)}
              >
                {camps.map((o) => (
                  <option key={o.id} value={o.alias}>
                    {o.alias}{o.username ? ` (${o.username})` : ''}
                  </option>
                ))}
              </select>
            ) : (
              <span className="ticket-picker-org-none">
                No camps available — add one in Settings
              </span>
            )}
          </div>
          {error && <div className="story-form-error">{error}</div>}
          <button
            className="btn-primary ticket-picker-assign"
            onClick={handleAssign}
            disabled={!selectedDirective || assigning}
          >
            {assigning ? 'Assigning...' : 'Start Work'}
          </button>
        </>
      )}
    </div>
  );
}

export default function ChatPane({ conscriptId }: ChatPaneProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [conscriptStatus, setConscriptStatus] = useState<ConscriptStatus>('IDLE');
  const [input, setInput] = useState('');
  const [rejectFeedback, setRejectFeedback] = useState('');
  const [showRejectInput, setShowRejectInput] = useState(false);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [hasNewMessages, setHasNewMessages] = useState(false);

  const messagesRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Load chat history when conscriptId changes
  useEffect(() => {
    if (!conscriptId) {
      setMessages([]);
      setConscriptStatus('IDLE');
      return;
    }

    let cancelled = false;

    Promise.all([
      window.sweatshop.chat.history(conscriptId),
      window.sweatshop.conscripts.get(conscriptId),
    ]).then(([history, conscript]) => {
      if (cancelled) return;
      setMessages(history);
      if (conscript) setConscriptStatus(conscript.status);
      setIsAtBottom(true);
      setHasNewMessages(false);
    });

    return () => { cancelled = true; };
  }, [conscriptId]);

  // Subscribe to IPC events
  useEffect(() => {
    if (!conscriptId) return;

    const handleNewMessage = (msg: ChatMessage) => {
      if (msg.conscriptId !== conscriptId) return;
      setMessages((prev) => [...prev, msg]);
      if (!isAtBottom) {
        setHasNewMessages(true);
      }
    };

    const handleStatusChanged = (data: { conscriptId: string; status: ConscriptStatus }) => {
      if (data.conscriptId !== conscriptId) return;
      setConscriptStatus(data.status);
    };

    window.sweatshop.chat.onMessage(handleNewMessage);
    window.sweatshop.conscripts.onStatusChanged(handleStatusChanged);
  }, [conscriptId, isAtBottom]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (isAtBottom && messagesRef.current) {
      messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
    }
  }, [messages, isAtBottom]);

  // Focus input when NEEDS_INPUT
  useEffect(() => {
    if (conscriptStatus === 'NEEDS_INPUT' && inputRef.current) {
      inputRef.current.focus();
    }
  }, [conscriptStatus]);

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
    if (!conscriptId || !input.trim()) return;
    const text = input.trim();
    setInput('');
    await window.sweatshop.chat.send(conscriptId, text);
  }, [conscriptId, input]);

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
    if (!conscriptId) return;
    const confirmed = window.confirm(
      'This will merge the conscript\'s work into the base branch. Are you sure?'
    );
    if (!confirmed) return;
    await window.sweatshop.conscripts.approve(conscriptId);
  }, [conscriptId]);

  const handleReject = useCallback(async () => {
    if (!conscriptId || !rejectFeedback.trim()) return;
    await window.sweatshop.conscripts.reject(conscriptId, rejectFeedback.trim());
    setRejectFeedback('');
    setShowRejectInput(false);
  }, [conscriptId, rejectFeedback]);

  const handleStop = useCallback(async () => {
    if (!conscriptId) return;
    await window.sweatshop.conscripts.stop(conscriptId);
  }, [conscriptId]);

  const isInputDisabled = !conscriptId || conscriptStatus === 'IDLE';

  const placeholderText = (() => {
    switch (conscriptStatus) {
      case 'NEEDS_INPUT': return 'The conscript is waiting for your response...';
      case 'QA_READY': return 'Add a note or use the buttons above...';
      case 'IDLE': return 'No active conversation';
      default: return 'Send a message to the conscript...';
    }
  })();

  return (
    <div className="chat-pane">
      {/* Directive picker — fixed above scroll area */}
      {conscriptId && conscriptStatus === 'IDLE' && (
        <DirectivePicker
          conscriptId={conscriptId}
          onAssigned={() => {/* status change will update via IPC */}}
        />
      )}

      {/* Messages area */}
      <div className="chat-messages" ref={messagesRef} onScroll={handleScroll}>
        {!conscriptId || (conscriptStatus !== 'IDLE' && messages.length === 0) ? (
          <div className="chat-empty">
            {conscriptId ? 'No messages yet' : 'Select a conscript to start chatting'}
          </div>
        ) : null}
        {messages.map((msg) => (
          <div key={msg.id} className={`chat-message ${msg.role}`}>
            {msg.role !== 'system' && (
              <div className="chat-message-header">
                <span className="chat-avatar">{msg.role === 'conscript' ? 'C' : 'U'}</span>
                <span className="chat-role-label">
                  {msg.role === 'conscript' ? 'Conscript' : 'You'}
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
        {(conscriptStatus === 'DEVELOPING' || conscriptStatus === 'REWORK' || conscriptStatus === 'BRANCHING' || conscriptStatus === 'MERGING' || conscriptStatus === 'ASSIGNED') && (
          <div className="chat-thinking">
            <span className="chat-thinking-dots">
              <span /><span /><span />
            </span>
            <span className="chat-thinking-label">
              {conscriptStatus === 'BRANCHING' ? 'Creating branch...' :
               conscriptStatus === 'ASSIGNED' ? 'Setting up...' :
               conscriptStatus === 'MERGING' ? 'Merging...' :
               conscriptStatus === 'REWORK' ? 'Reworking...' :
               'Conscript is working...'}
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
      {conscriptStatus === 'QA_READY' && (
        <div className="chat-action-bar qa-ready">
          <div className="chat-action-label">Development complete — review the PR in the Review Changes tab</div>
          <div className="chat-action-buttons">
            <button className="approve-btn" onClick={handleApprove}>Quick Approve</button>
          </div>
        </div>
      )}

      {conscriptStatus === 'NEEDS_INPUT' && (
        <div className="chat-action-bar needs-input">
          <div className="chat-action-label">Conscript is waiting for your input</div>
        </div>
      )}

      {conscriptStatus === 'ERROR' && (
        <div className="chat-action-bar error-state">
          <div className="chat-action-label">Conscript encountered an error</div>
          <div className="chat-action-buttons">
            <button className="btn-primary" onClick={() => conscriptId && window.sweatshop.chat.send(conscriptId, 'Please retry the last action.')}>
              Retry
            </button>
            <button className="reject-btn" onClick={handleStop}>Stop Conscript</button>
          </div>
        </div>
      )}

      {/* Stop button for working conscripts */}
      {(conscriptStatus === 'DEVELOPING' || conscriptStatus === 'REWORK' || conscriptStatus === 'BRANCHING' || conscriptStatus === 'MERGING' || conscriptStatus === 'ASSIGNED') && (
        <div className="chat-action-bar working-state">
          <div className="chat-action-label">
            <span className="working-indicator" />
            {conscriptStatus === 'BRANCHING' ? 'Creating branch...' :
             conscriptStatus === 'ASSIGNED' ? 'Setting up conscript...' :
             conscriptStatus === 'MERGING' ? 'Merging to base branch...' :
             conscriptStatus === 'REWORK' ? 'Conscript is reworking...' :
             'Conscript is developing...'}
          </div>
          <div className="chat-action-buttons">
            <button className="reject-btn" onClick={handleStop}>Stop Conscript</button>
          </div>
        </div>
      )}

      {/* Input area */}
      <div className={`chat-input-area ${conscriptStatus === 'NEEDS_INPUT' ? 'highlight' : ''}`}>
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
