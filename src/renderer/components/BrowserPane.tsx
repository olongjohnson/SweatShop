import React, { useState, useRef, useEffect, useCallback } from 'react';
import type { AgentStatus } from '../../shared/types';

interface BrowserPaneProps {
  agentId: string | null;
}

export default function BrowserPane({ agentId }: BrowserPaneProps) {
  const [currentURL, setCurrentURL] = useState('');
  const [agentStatus, setAgentStatus] = useState<AgentStatus>('IDLE');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Track agent status for display
  useEffect(() => {
    if (!agentId) {
      setAgentStatus('IDLE');
      setCurrentURL('');
      return;
    }

    window.sweatshop.agents.get(agentId).then((agent) => {
      if (agent) setAgentStatus(agent.status);
    });

    const handleStatus = (data: { agentId: string; status: AgentStatus }) => {
      if (data.agentId !== agentId) return;
      setAgentStatus(data.status);
    };

    window.sweatshop.agents.onStatusChanged(handleStatus);
  }, [agentId]);

  // Update bounds when container resizes
  useEffect(() => {
    if (!agentId || !containerRef.current) return;

    const updateBounds = () => {
      if (!containerRef.current || !agentId) return;
      const rect = containerRef.current.getBoundingClientRect();
      window.sweatshop.browser.setBounds(agentId, {
        x: Math.round(rect.left),
        y: Math.round(rect.top),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      });
    };

    const observer = new ResizeObserver(updateBounds);
    observer.observe(containerRef.current);

    // Also update on window resize
    window.addEventListener('resize', updateBounds);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', updateBounds);
    };
  }, [agentId]);

  // Show/hide browser when agent changes
  useEffect(() => {
    if (!agentId) {
      window.sweatshop.browser.hideAll();
      return;
    }

    // Poll current URL
    const interval = setInterval(async () => {
      const url = await window.sweatshop.browser.getURL(agentId);
      if (url) setCurrentURL(url);
    }, 2000);

    return () => clearInterval(interval);
  }, [agentId]);

  const handleBack = useCallback(() => {
    if (agentId) window.sweatshop.browser.back(agentId);
  }, [agentId]);

  const handleForward = useCallback(() => {
    if (agentId) window.sweatshop.browser.forward(agentId);
  }, [agentId]);

  const handleReload = useCallback(() => {
    if (agentId) window.sweatshop.browser.reload(agentId);
  }, [agentId]);

  const hasURL = currentURL.length > 0;

  return (
    <div className={`browser-pane ${isFullscreen ? 'fullscreen' : ''}`}>
      {/* Navigation bar */}
      <div className="browser-nav">
        <button className="browser-nav-btn" onClick={handleBack} disabled={!hasURL} title="Back">
          ←
        </button>
        <button className="browser-nav-btn" onClick={handleForward} disabled={!hasURL} title="Forward">
          →
        </button>
        <button className="browser-nav-btn" onClick={handleReload} disabled={!hasURL} title="Reload">
          ↻
        </button>
        <div className="browser-url-bar">
          {currentURL || 'No page loaded'}
        </div>
        <button
          className="browser-nav-btn"
          onClick={() => setIsFullscreen(!isFullscreen)}
          title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
        >
          {isFullscreen ? '⊡' : '⊞'}
        </button>
      </div>

      {/* Content area */}
      <div className="browser-content" ref={containerRef}>
        {!hasURL && (
          <div className="browser-placeholder">
            <div className="browser-placeholder-icon">⊞</div>
            <h3>Browser Pane</h3>
            <p>
              {agentStatus === 'QA_READY'
                ? 'Loading scratch org...'
                : agentStatus === 'IDLE'
                ? 'Select an agent to view their scratch org'
                : 'Waiting for agent to reach QA_READY...'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
