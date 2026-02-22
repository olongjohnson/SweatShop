import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { LwcPreviewStatus } from '../../shared/types';

interface LwcPreviewPanelProps {
  conscriptId: string;
}

export default function LwcPreviewPanel({ conscriptId }: LwcPreviewPanelProps) {
  const [components, setComponents] = useState<string[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'starting' | 'running' | 'error' | 'stopped'>('idle');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [output, setOutput] = useState('');
  const [expanded, setExpanded] = useState(false);
  const [showConsole, setShowConsole] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const consoleRef = useRef<HTMLDivElement>(null);
  const viewId = `${conscriptId}-lwc-preview`;

  // Detect LWC components on mount
  useEffect(() => {
    window.sweatshop.lwcPreview.detect(conscriptId).then((comps) => {
      setComponents(comps);
      if (comps.length > 0) setSelected(comps[0]);
    }).catch(() => {
      // No LWC components or detection failed
    });
  }, [conscriptId]);

  // Subscribe to status and output events
  useEffect(() => {
    window.sweatshop.lwcPreview.onStatus((data: LwcPreviewStatus) => {
      if (data.conscriptId !== conscriptId) return;
      if (data.status === 'running') {
        setStatus('running');
        if (data.previewUrl) setPreviewUrl(data.previewUrl);
      } else if (data.status === 'error') {
        setStatus('error');
        setError(data.error || 'Dev server error');
      } else if (data.status === 'stopped') {
        setStatus('stopped');
      } else if (data.status === 'starting') {
        setStatus('starting');
      }
    });

    window.sweatshop.lwcPreview.onOutput((data) => {
      if (data.conscriptId !== conscriptId) return;
      setOutput((prev) => prev + data.data);
    });
  }, [conscriptId]);

  // Auto-scroll console
  useEffect(() => {
    if (consoleRef.current) {
      consoleRef.current.scrollTop = consoleRef.current.scrollHeight;
    }
  }, [output]);

  // Manage browser view bounds when running
  useEffect(() => {
    if (status !== 'running' || !containerRef.current) return;

    const updateBounds = () => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      window.sweatshop.browser.setBounds(viewId, {
        x: Math.round(rect.left),
        y: Math.round(rect.top),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      });
    };

    const observer = new ResizeObserver(updateBounds);
    observer.observe(containerRef.current);
    window.addEventListener('resize', updateBounds);
    // Initial bounds
    updateBounds();

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', updateBounds);
    };
  }, [status, viewId]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      window.sweatshop.lwcPreview.stop(conscriptId).catch(() => {});
      window.sweatshop.browser.hideAll().catch(() => {});
    };
  }, [conscriptId]);

  const handleStart = useCallback(async () => {
    if (!selected) return;
    setStatus('starting');
    setOutput('');
    setError('');
    setExpanded(true);

    try {
      const url = await window.sweatshop.lwcPreview.start(conscriptId, selected);
      setPreviewUrl(url);
      setStatus('running');

      // Create and show browser view
      await window.sweatshop.browser.createLocalPreview(viewId);
      await window.sweatshop.browser.loadLocalURL(viewId, url);

      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        await window.sweatshop.browser.show(viewId, {
          x: Math.round(rect.left),
          y: Math.round(rect.top),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        });
      }
    } catch (err: any) {
      setStatus('error');
      setError(err.message || 'Failed to start dev server');
    }
  }, [conscriptId, selected, viewId]);

  const handleStop = useCallback(async () => {
    await window.sweatshop.lwcPreview.stop(conscriptId);
    await window.sweatshop.browser.hideAll();
    setStatus('idle');
    setPreviewUrl(null);
  }, [conscriptId]);

  // If no LWC components detected, render nothing
  if (components.length === 0) return null;

  const isRunning = status === 'running';
  const isStarting = status === 'starting';

  return (
    <div className="lwc-preview-panel">
      {/* Header */}
      <button
        className="lwc-preview-header"
        onClick={() => setExpanded(!expanded)}
      >
        <span className="lwc-preview-title">
          {expanded ? '\u25BE' : '\u25B8'} LWC Preview
          <span className="lwc-preview-badge">
            {components.length} component{components.length !== 1 ? 's' : ''}
          </span>
        </span>
        {(isRunning || isStarting) && (
          <span className={`lwc-preview-status ${status}`}>
            <span className="lwc-preview-status-dot" />
            {isStarting ? 'Starting...' : 'Running'}
          </span>
        )}
        {status === 'error' && (
          <span className="lwc-preview-status error">
            <span className="lwc-preview-status-dot" />
            Error
          </span>
        )}
      </button>

      {expanded && (
        <>
          {/* Controls */}
          <div className="lwc-preview-controls">
            <select
              className="lwc-preview-select"
              value={selected || ''}
              onChange={(e) => setSelected(e.target.value)}
              disabled={isRunning || isStarting}
            >
              {components.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>

            {isRunning || isStarting ? (
              <button
                className="lwc-preview-stop-btn"
                onClick={handleStop}
                disabled={isStarting}
              >
                Stop Preview
              </button>
            ) : (
              <button
                className="lwc-preview-start-btn"
                onClick={handleStart}
                disabled={!selected}
              >
                Start Preview
              </button>
            )}

            {isRunning && (
              <button
                className="lwc-preview-reload-btn"
                onClick={() => window.sweatshop.browser.reload(viewId)}
                title="Reload preview"
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M8 3a5 5 0 104.546 2.914.5.5 0 01.908-.418A6 6 0 118 2v1z" />
                  <path d="M8 4.466V.534a.25.25 0 01.41-.192l2.36 1.966c.12.1.12.284 0 .384L8.41 4.658A.25.25 0 018 4.466z" />
                </svg>
              </button>
            )}

            <button
              className="lwc-preview-console-toggle"
              onClick={() => setShowConsole(!showConsole)}
            >
              {showConsole ? 'Hide' : 'Show'} Console
            </button>
          </div>

          {/* Error message */}
          {status === 'error' && error && (
            <div className="lwc-preview-error">{error}</div>
          )}

          {/* Preview container (WebContentsView attaches here) */}
          {(isRunning || isStarting) && (
            <div className="lwc-preview-container" ref={containerRef}>
              {isStarting && (
                <div className="lwc-preview-starting">
                  <div className="lwc-preview-spinner" />
                  <span>Starting dev server for {selected}...</span>
                </div>
              )}
            </div>
          )}

          {/* Console output */}
          {showConsole && output && (
            <div className="lwc-preview-console" ref={consoleRef}>
              {output}
            </div>
          )}
        </>
      )}
    </div>
  );
}
