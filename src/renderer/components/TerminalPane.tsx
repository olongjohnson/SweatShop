import React, { useRef, useEffect } from 'react';

interface TerminalLine {
  type: 'cmd' | 'output' | 'success' | 'progress';
  text: string;
}

const MOCK_OUTPUT: TerminalLine[] = [
  { type: 'cmd', text: '$ git checkout -b feature/TICKET-001-login-page' },
  { type: 'output', text: "Switched to a new branch 'feature/TICKET-001-login-page'" },
  { type: 'cmd', text: '$ sf project deploy start -o agent-1-org' },
  { type: 'progress', text: 'Deploying... ████████████░░░░ 75%' },
  { type: 'success', text: '✓ Deploy complete (42 components)' },
  { type: 'cmd', text: '$ sf apex run test -o agent-1-org --synchronous' },
  { type: 'output', text: 'Running tests...' },
  { type: 'success', text: '✓ 18/18 tests passed' },
];

export default function TerminalPane() {
  const outputRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, []);

  return (
    <div className="terminal-pane">
      <div className="terminal-header">Terminal</div>
      <div className="terminal-output" ref={outputRef}>
        {MOCK_OUTPUT.map((line, i) => (
          <div key={i} className="terminal-line">
            <span className={line.type}>{line.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
