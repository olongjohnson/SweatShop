import React, { useRef, useEffect } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';

interface TerminalPaneProps {
  agentId: string | null;
}

const terminalTheme = {
  background: '#0d0d0d',
  foreground: '#e0e0e0',
  cursor: '#569CD6',
  cursorAccent: '#0d0d0d',
  selectionBackground: '#3a3a5a',
  black: '#1a1a2e',
  red: '#e94560',
  green: '#7ed321',
  yellow: '#f5a623',
  blue: '#4a90d9',
  magenta: '#9013fe',
  cyan: '#50e3c2',
  white: '#e0e0e0',
  brightBlack: '#606080',
  brightRed: '#ff6b81',
  brightGreen: '#a8e6cf',
  brightYellow: '#ffd93d',
  brightBlue: '#6eb5ff',
  brightMagenta: '#b388ff',
  brightCyan: '#84ffff',
  brightWhite: '#ffffff',
};

// Store terminal buffers per agent so switching tabs preserves scrollback
const agentBuffers = new Map<string, string>();

export default function TerminalPane({ agentId }: TerminalPaneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);

  // Create xterm instance and wire IPC
  useEffect(() => {
    if (!containerRef.current) return;

    const term = new Terminal({
      theme: terminalTheme,
      fontFamily: "'Consolas', 'Courier New', monospace",
      fontSize: 13,
      scrollback: 5000,
      disableStdin: true,
      cursorBlink: false,
      convertEol: true,
    });

    const fitAddon = new FitAddon();
    const webLinksAddon = new WebLinksAddon();

    term.loadAddon(fitAddon);
    term.loadAddon(webLinksAddon);
    term.open(containerRef.current);

    // Initial fit
    try { fitAddon.fit(); } catch { /* container not visible yet */ }

    termRef.current = term;
    fitAddonRef.current = fitAddon;

    // Restore buffered output for this agent
    if (agentId && agentBuffers.has(agentId)) {
      term.write(agentBuffers.get(agentId)!);
    }

    // Subscribe to terminal data via IPC
    if (agentId) {
      const handleTerminalData = (data: { agentId: string; data: string }) => {
        if (data.agentId !== agentId) return;
        // Accumulate in buffer
        const existing = agentBuffers.get(agentId) || '';
        agentBuffers.set(agentId, existing + data.data);
        term.write(data.data);
      };

      window.sweatshop.agents.onTerminalData(handleTerminalData);
    }

    // ResizeObserver for auto-fit
    const observer = new ResizeObserver(() => {
      try { fitAddon.fit(); } catch { /* ignore */ }
    });
    observer.observe(containerRef.current);

    return () => {
      observer.disconnect();
      term.dispose();
      termRef.current = null;
      fitAddonRef.current = null;
    };
  }, [agentId]);

  return (
    <div className="terminal-pane">
      <div className="terminal-header">
        Terminal{agentId ? '' : ' — No agent selected'}
      </div>
      <div className="terminal-container" ref={containerRef} />
    </div>
  );
}
