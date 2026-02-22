import React, { useState, useRef, useEffect } from 'react';

interface CampBrowserEmbedProps {
  campAlias: string;
}

export default function CampBrowserEmbed({ campAlias }: CampBrowserEmbedProps) {
  const VIEW_ID = 'camp-browse';
  const [currentURL, setCurrentURL] = useState('');
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Load camp URL when alias changes
  useEffect(() => {
    if (!campAlias) return;

    let cancelled = false;
    setLoading(true);

    (async () => {
      try {
        const url = await window.sweatshop.camps.openCamp(campAlias);
        if (cancelled || !url) return;
        await window.sweatshop.browser.loadURL(VIEW_ID, url);
        setCurrentURL(url);
      } catch (err) {
        console.error('Failed to open camp:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [campAlias]);

  // Show browser view and track bounds
  useEffect(() => {
    if (!containerRef.current) return;

    const updateBounds = () => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const bounds = {
        x: Math.round(rect.left),
        y: Math.round(rect.top),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      };
      if (currentURL) {
        window.sweatshop.browser.show(VIEW_ID, bounds);
      }
      window.sweatshop.browser.setBounds(VIEW_ID, bounds);
    };

    const observer = new ResizeObserver(updateBounds);
    observer.observe(containerRef.current);
    window.addEventListener('resize', updateBounds);

    // Initial bounds
    updateBounds();

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', updateBounds);
      window.sweatshop.browser.hideAll();
    };
  }, [currentURL]);

  // Poll current URL
  useEffect(() => {
    const interval = setInterval(async () => {
      const url = await window.sweatshop.browser.getURL(VIEW_ID);
      if (url) setCurrentURL(url);
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  const hasURL = currentURL.length > 0;

  return (
    <div className="browser-pane">
      <div className="browser-content" ref={containerRef}>
        {!hasURL && !loading && (
          <div className="browser-placeholder">
            <div className="browser-placeholder-icon">⊞</div>
            <h3>Camp Browser</h3>
            <p>Loading Salesforce org...</p>
          </div>
        )}
        {loading && (
          <div className="browser-placeholder">
            <div className="settings-auth-login-spinner" />
            <h3>Opening Camp</h3>
            <p>Authenticating with Salesforce...</p>
          </div>
        )}
      </div>
    </div>
  );
}
