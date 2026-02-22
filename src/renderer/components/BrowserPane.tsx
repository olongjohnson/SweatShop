import React, { useState, useRef, useEffect, useCallback } from 'react';
import type { ConscriptStatus } from '../../shared/types';

interface BrowserPaneProps {
  conscriptId: string | null;
}

export default function BrowserPane({ conscriptId }: BrowserPaneProps) {
  const [currentURL, setCurrentURL] = useState('');
  const [conscriptStatus, setConscriptStatus] = useState<ConscriptStatus>('IDLE');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Track conscript status for display
  useEffect(() => {
    if (!conscriptId) {
      setConscriptStatus('IDLE');
      setCurrentURL('');
      return;
    }

    window.sweatshop.conscripts.get(conscriptId).then((conscript) => {
      if (conscript) setConscriptStatus(conscript.status);
    });

    const handleStatus = (data: { conscriptId: string; status: ConscriptStatus }) => {
      if (data.conscriptId !== conscriptId) return;
      setConscriptStatus(data.status);
    };

    window.sweatshop.conscripts.onStatusChanged(handleStatus);
  }, [conscriptId]);

  // Update bounds when container resizes
  useEffect(() => {
    if (!conscriptId || !containerRef.current) return;

    const updateBounds = () => {
      if (!containerRef.current || !conscriptId) return;
      const rect = containerRef.current.getBoundingClientRect();
      window.sweatshop.browser.setBounds(conscriptId, {
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
  }, [conscriptId]);

  // Show/hide browser when conscript changes
  useEffect(() => {
    if (!conscriptId) {
      window.sweatshop.browser.hideAll();
      return;
    }

    // Poll current URL
    const interval = setInterval(async () => {
      const url = await window.sweatshop.browser.getURL(conscriptId);
      if (url) setCurrentURL(url);
    }, 2000);

    return () => clearInterval(interval);
  }, [conscriptId]);

  const handleBack = useCallback(() => {
    if (conscriptId) window.sweatshop.browser.back(conscriptId);
  }, [conscriptId]);

  const handleForward = useCallback(() => {
    if (conscriptId) window.sweatshop.browser.forward(conscriptId);
  }, [conscriptId]);

  const handleReload = useCallback(() => {
    if (conscriptId) window.sweatshop.browser.reload(conscriptId);
  }, [conscriptId]);

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
              {conscriptStatus === 'QA_READY'
                ? 'Loading camp...'
                : conscriptStatus === 'IDLE'
                ? 'Select a conscript to view their camp'
                : 'Waiting for conscript to reach QA_READY...'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
