import React, { useRef, useEffect } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';

interface TerminalPaneProps {
  conscriptId: string | null;
}

const terminalTheme = {
  background: '#050505',
  foreground: '#e8e8e8',
  cursor: '#F50046',
  cursorAccent: '#0a0a0a',
  selectionBackground: '#333333',
  black: '#111111',
  red: '#F50046',
  green: '#23AAFF',
  yellow: '#ffb800',
  blue: '#23AAFF',
  magenta: '#F50046',
  cyan: '#50e3c2',
  white: '#e8e8e8',
  brightBlack: '#666666',
  brightRed: '#ff1a5e',
  brightGreen: '#5bc0ff',
  brightYellow: '#ffd93d',
  brightBlue: '#5bc0ff',
  brightMagenta: '#c77dff',
  brightCyan: '#84ffff',
  brightWhite: '#ffffff',
};

// Store terminal buffers per conscript so switching tabs preserves scrollback
const conscriptBuffers = new Map<string, string>();

export default function TerminalPane({ conscriptId }: TerminalPaneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);

  // Create xterm instance and wire IPC
  useEffect(() => {
    if (!containerRef.current) return;

    const term = new Terminal({
      theme: terminalTheme,
      fontFamily: "'JetBrains Mono', 'SF Mono', 'Fira Code', monospace",
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

    // Restore buffered output for this conscript
    if (conscriptId && conscriptBuffers.has(conscriptId)) {
      term.write(conscriptBuffers.get(conscriptId)!);
    }

    // Subscribe to terminal data via IPC
    if (conscriptId) {
      const handleTerminalData = (data: { conscriptId: string; data: string }) => {
        if (data.conscriptId !== conscriptId) return;
        // Accumulate in buffer
        const existing = conscriptBuffers.get(conscriptId) || '';
        conscriptBuffers.set(conscriptId, existing + data.data);
        term.write(data.data);
      };

      window.sweatshop.conscripts.onTerminalData(handleTerminalData);
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
  }, [conscriptId]);

  return (
    <div className="terminal-pane">
      <div className="terminal-header">
        Terminal{conscriptId ? '' : ' — No conscript selected'}
      </div>
      <div className="terminal-container" ref={containerRef} />
    </div>
  );
}
