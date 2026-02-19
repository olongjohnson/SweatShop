import React, { useState, useCallback, useRef } from 'react';
import ChatPane from './ChatPane';
import ResizableDivider from './ResizableDivider';
import TerminalPane from './TerminalPane';

interface SidebarProps {
  agentId: string | null;
}

export default function Sidebar({ agentId }: SidebarProps) {
  // Chat takes 55% of sidebar height by default
  const [chatRatio, setChatRatio] = useState(0.55);
  const sidebarRef = useRef<HTMLDivElement>(null);

  const handleVerticalResize = useCallback((delta: number) => {
    if (!sidebarRef.current) return;
    const height = sidebarRef.current.getBoundingClientRect().height;
    const newRatio = chatRatio + delta / height;
    // Clamp between 20% and 80%
    setChatRatio(Math.max(0.2, Math.min(0.8, newRatio)));
  }, [chatRatio]);

  return (
    <div className="sidebar" ref={sidebarRef}>
      <div style={{ flex: chatRatio, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <ChatPane agentId={agentId} />
      </div>
      <ResizableDivider direction="horizontal" onResize={handleVerticalResize} />
      <div style={{ flex: 1 - chatRatio, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <TerminalPane />
      </div>
    </div>
  );
}
