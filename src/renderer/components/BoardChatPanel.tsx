import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { ChatMessage } from '../../shared/types';

interface BoardChatPanelProps {
  conscriptId: string;
}

export default function BoardChatPanel({ conscriptId }: BoardChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  // Load history + subscribe to new messages
  useEffect(() => {
    let mounted = true;

    window.sweatshop.chat.history(conscriptId).then((history) => {
      if (mounted) {
        setMessages(history.slice(-50));
        setTimeout(scrollToBottom, 50);
      }
    });

    window.sweatshop.chat.onMessage((msg: ChatMessage) => {
      if (mounted && msg.conscriptId === conscriptId) {
        setMessages((prev) => [...prev.slice(-49), msg]);
        setTimeout(scrollToBottom, 50);
      }
    });

    return () => { mounted = false; };
  }, [conscriptId, scrollToBottom]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || sending) return;

    setSending(true);
    setInput('');
    try {
      await window.sweatshop.chat.send(conscriptId, text);
    } catch {
      // Message send failed — will show in chat as system error if applicable
    }
    setSending(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const roleLabel = (role: ChatMessage['role']) => {
    switch (role) {
      case 'conscript': return 'agent';
      case 'user': return 'you';
      case 'system': return 'sys';
    }
  };

  return (
    <div className="board-chat-panel">
      <div className="board-chat-messages" ref={messagesContainerRef}>
        {messages.length === 0 && (
          <div className="board-chat-empty">No messages yet.</div>
        )}
        {messages.map((msg) => (
          <div key={msg.id} className={`board-chat-msg board-chat-msg--${msg.role}`}>
            <span className="board-chat-msg-role">{roleLabel(msg.role)}</span>
            <span className="board-chat-msg-text">{msg.content}</span>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>
      <div className="board-chat-input-row">
        <input
          type="text"
          className="board-chat-input"
          placeholder="Send a message..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={sending}
        />
        <button
          className="board-btn-sm btn-primary board-chat-send"
          onClick={handleSend}
          disabled={!input.trim() || sending}
        >
          Send
        </button>
      </div>
    </div>
  );
}
