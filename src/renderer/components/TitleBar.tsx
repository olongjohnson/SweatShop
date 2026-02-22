import React, { useState, useEffect } from 'react';
import logoUrl from '../icon.png';

type AppView = 'dashboard' | 'board' | 'commissariat' | 'analytics' | 'settings';

interface CampStatus {
  total: number;
  available: number;
  leased: number;
  expired: number;
}

interface TitleBarProps {
  activeView: AppView;
  onNavigate: (view: AppView) => void;
}

export default function TitleBar({ activeView, onNavigate }: TitleBarProps) {
  const [campStatus, setCampStatus] = useState<CampStatus | null>(null);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const status = await window.sweatshop.camps.getStatus();
        if (mounted) setCampStatus(status);
      } catch { /* camp pool not initialized yet */ }
    };
    load();
    const interval = setInterval(load, 10000);
    return () => { mounted = false; clearInterval(interval); };
  }, []);

  return (
    <div className="titlebar">
      <div className="titlebar-brand" onClick={() => onNavigate('dashboard')} style={{ cursor: 'pointer' }}>
        <img src={logoUrl} alt="SweatShop" />
        <span>SweatShop</span>
      </div>
      <div className="titlebar-nav">
        <button
          className={`titlebar-nav-btn ${activeView === 'board' ? 'active' : ''}`}
          onClick={() => onNavigate('board')}
        >
          The Politburo
        </button>
        <button
          className={`titlebar-nav-btn ${activeView === 'dashboard' ? 'active' : ''}`}
          onClick={() => onNavigate('dashboard')}
        >
          Camp Audit
        </button>
        <button
          className={`titlebar-nav-btn ${activeView === 'commissariat' ? 'active' : ''}`}
          onClick={() => onNavigate('commissariat')}
        >
          The Commissariat
        </button>
      </div>
      <div className="titlebar-spacer" />
      {campStatus && campStatus.total > 0 && (
        <div className="org-pool-indicator" title={`${campStatus.available} available, ${campStatus.leased} leased, ${campStatus.expired} expired`}>
          <span className="org-pool-dot" />
          <span className="org-pool-label">Camps</span>
          <span className="org-pool-count">{campStatus.available}/{campStatus.total}</span>
        </div>
      )}
      <div className="titlebar-actions">
        <button
          title="Analytics"
          className={activeView === 'analytics' ? 'active' : ''}
          onClick={() => onNavigate('analytics')}
        >
          Analytics
        </button>
        <button
          title="Settings"
          className={activeView === 'settings' ? 'active' : ''}
          onClick={() => onNavigate('settings')}
        >
          Settings
        </button>
      </div>
    </div>
  );
}
