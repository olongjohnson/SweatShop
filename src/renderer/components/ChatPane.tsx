import React, { useState, useRef, useEffect } from 'react';

interface ChatMessage {
  sender: 'agent' | 'user';
  text: string;
}

const MOCK_MESSAGES: ChatMessage[] = [
  { sender: 'agent', text: 'Starting work on TICKET-001: Implement login page' },
  { sender: 'agent', text: 'Created branch feature/TICKET-001-login-page' },
  { sender: 'agent', text: 'I have a question about the authentication method. Should I use OAuth2 or SAML?' },
  { sender: 'user', text: 'Use OAuth2' },
  { sender: 'agent', text: 'Development complete. Ready for QA review.' },
];

interface ChatPaneProps {
  showQaActions?: boolean;
}

export default function ChatPane({ showQaActions = true }: ChatPaneProps) {
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  return (
    <div className="chat-pane">
      <div className="chat-messages">
        {MOCK_MESSAGES.map((msg, i) => (
          <div key={i} className={`chat-message ${msg.sender}`}>
            <div className="sender">{msg.sender === 'agent' ? 'Agent 1' : 'You'}</div>
            {msg.text}
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>
      {showQaActions && (
        <div className="chat-qa-actions">
          <button className="approve-btn">Approve</button>
          <button className="reject-btn">Reject</button>
        </div>
      )}
      <div className="chat-input-area">
        <input
          type="text"
          placeholder="Type a message..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
        />
        <button>Send</button>
      </div>
    </div>
  );
}
