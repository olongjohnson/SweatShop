import React, { useState, useRef, useEffect, useCallback } from 'react';
import type { ChatMessage, AgentStatus } from '../../shared/types';

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
  // Lightweight markdown: bold, inline code, code blocks, newlines
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

    // Process inline formatting
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

  // Handle unclosed code blocks
  if (inCodeBlock && codeBlockLines.length > 0) {
    parts.push(
      <pre key="cb-end" className="chat-code-block">
        <code>{codeBlockLines.join('\n')}</code>
      </pre>
    );
  }

  return parts;
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

    // Load history + current status
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

    // Note: cleanup requires removeListener support in preload.
    // For now listeners accumulate — Prompt 12 (lifecycle) will add cleanup.
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

  // Scroll handler to detect if user scrolled up
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

  // Send message
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

  // Action handlers
  const handleApprove = useCallback(async () => {
    if (!agentId) return;
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
        {messages.length === 0 && (
          <div className="chat-empty">
            {agentId ? 'No messages yet' : 'Select an agent to start chatting'}
          </div>
        )}
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
      </div>

      {/* New messages pill */}
      {hasNewMessages && (
        <button className="chat-new-messages-pill" onClick={scrollToBottom}>
          New messages ↓
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
