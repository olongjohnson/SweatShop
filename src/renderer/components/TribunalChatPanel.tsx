import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { ChatMessage } from '../../shared/types';

interface TribunalChatPanelProps {
  conscriptId: string;
}

export default function TribunalChatPanel({ conscriptId }: TribunalChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const messagesRef = useRef<HTMLDivElement>(null);

  // Load chat history
  useEffect(() => {
    let mounted = true;
    window.sweatshop.chat.history(conscriptId).then((history) => {
      if (mounted) setMessages(history);
    });
    return () => { mounted = false; };
  }, [conscriptId]);

  // Subscribe to new messages
  useEffect(() => {
    const handler = (msg: ChatMessage) => {
      if (msg.conscriptId !== conscriptId) return;
      setMessages((prev) => [...prev, msg]);
    };
    window.sweatshop.chat.onMessage(handler);
  }, [conscriptId]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (messagesRef.current) {
      messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = useCallback(async () => {
    if (!input.trim() || sending) return;
    setSending(true);
    try {
      await window.sweatshop.chat.send(conscriptId, input.trim());
      setInput('');
    } catch (err) {
      console.error('Failed to send message:', err);
    } finally {
      setSending(false);
    }
  }, [conscriptId, input, sending]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const roleClass = (role: string) => {
    if (role === 'conscript') return 'tribunal-chat-role--conscript';
    if (role === 'user') return 'tribunal-chat-role--user';
    return 'tribunal-chat-role--system';
  };

  return (
    <div className="tribunal-chat">
      <div className="tribunal-chat-messages" ref={messagesRef}>
        {messages.length === 0 && (
          <div className="tribunal-chat-empty">No messages yet</div>
        )}
        {messages.map((msg) => (
          <div key={msg.id} className="tribunal-chat-msg">
            <span className={`tribunal-chat-role ${roleClass(msg.role)}`}>
              {msg.role}
            </span>
            <span className="tribunal-chat-text">{msg.content}</span>
          </div>
        ))}
      </div>
      <div className="tribunal-chat-input">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask the conscript..."
          disabled={sending}
        />
        <button onClick={handleSend} disabled={!input.trim() || sending}>
          Send
        </button>
      </div>
    </div>
  );
}
