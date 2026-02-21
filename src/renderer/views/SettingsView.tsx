import React, { useState, useEffect } from 'react';
import type { SweatShopSettings } from '../../shared/types';

export default function SettingsView() {
  const [settings, setSettings] = useState<SweatShopSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Claude Code auth
  const [authStatus, setAuthStatus] = useState<{
    authenticated: boolean;
    method: string;
    error?: string;
  } | null>(null);
  const [authChecking, setAuthChecking] = useState(false);

  // Local form state
  const [baseBranch, setBaseBranch] = useState('main');
  const [mergeStrategy, setMergeStrategy] = useState<'squash' | 'merge'>('squash');
  const [workingDirectory, setWorkingDirectory] = useState('');
  const [maxOrgs, setMaxOrgs] = useState(4);
  const [scratchDefPath, setScratchDefPath] = useState('config/project-scratch-def.json');
  const [defaultDuration, setDefaultDuration] = useState(7);
  const [dmInstanceUrl, setDmInstanceUrl] = useState('');
  const [dmObjectName, setDmObjectName] = useState('');
  const [dmAccessToken, setDmAccessToken] = useState('');

  useEffect(() => {
    const load = async () => {
      const [s, auth] = await Promise.all([
        window.sweatshop.settings.get(),
        window.sweatshop.claude.authStatus(),
      ]);
      setSettings(s);
      setAuthStatus(auth);
      setBaseBranch(s.git?.baseBranch || 'main');
      setMergeStrategy(s.git?.mergeStrategy || 'squash');
      setWorkingDirectory(s.git?.workingDirectory || '');
      setMaxOrgs(s.orgPool?.maxOrgs ?? 4);
      setScratchDefPath(s.orgPool?.scratchDefPath || 'config/project-scratch-def.json');
      setDefaultDuration(s.orgPool?.defaultDurationDays ?? 7);
      setDmInstanceUrl(s.deathmark?.instanceUrl || '');
      setDmObjectName(s.deathmark?.objectName || '');
      setDmAccessToken(s.deathmark?.accessToken || '');
    };
    load();
  }, []);

  const handleCheckAuth = async () => {
    setAuthChecking(true);
    try {
      const status = await window.sweatshop.claude.authStatus();
      setAuthStatus(status);
    } finally {
      setAuthChecking(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    try {
      const updated = await window.sweatshop.settings.update({
        git: {
          baseBranch,
          mergeStrategy,
          workingDirectory,
        },
        orgPool: {
          maxOrgs,
          scratchDefPath,
          defaultDurationDays: defaultDuration,
        },
        deathmark: dmInstanceUrl ? {
          instanceUrl: dmInstanceUrl,
          objectName: dmObjectName || 'Case',
          accessToken: dmAccessToken || undefined,
          fieldMapping: settings?.deathmark?.fieldMapping || {
            title: 'Subject',
            description: 'Description',
            acceptanceCriteria: 'Acceptance_Criteria__c',
            priority: 'Priority',
            status: 'Status',
            labels: 'Labels__c',
          },
        } : undefined,
      });
      setSettings(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } finally {
      setSaving(false);
    }
  };

  const handleTestDeathmark = async () => {
    try {
      await window.sweatshop.deathmark.testConnection();
      alert('Connection successful!');
    } catch (err: any) {
      alert(`Connection failed: ${err.message || err}`);
    }
  };

  if (!settings) {
    return (
      <div className="settings-view">
        <div className="settings-loading">Loading settings...</div>
      </div>
    );
  }

  return (
    <div className="settings-view">
      <div className="settings-header">
        <h2>Settings</h2>
        <div className="settings-actions">
          {saved && <span className="settings-saved-badge">Saved</span>}
          <button className="btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </div>

      <div className="settings-body">
        {/* Claude Code Auth Section */}
        <div className="settings-section">
          <div className="settings-section-title">Claude Code</div>
          <div className="settings-section-desc">
            Agents use Claude Code CLI for authentication. Run <code>claude login</code> in your terminal to authenticate.
          </div>
          <div className="settings-auth-status">
            <div className={`settings-auth-indicator ${authStatus?.authenticated ? 'connected' : 'disconnected'}`}>
              <span className="settings-auth-dot" />
              <span className="settings-auth-text">
                {authStatus === null
                  ? 'Checking...'
                  : authStatus.authenticated
                    ? `Authenticated via ${authStatus.method}`
                    : authStatus.error || 'Not authenticated'}
              </span>
            </div>
            <button
              className="btn-secondary"
              onClick={handleCheckAuth}
              disabled={authChecking}
            >
              {authChecking ? 'Checking...' : 'Refresh Status'}
            </button>
          </div>
          {authStatus && !authStatus.authenticated && (
            <div className="settings-auth-help">
              Open a terminal and run: <code>claude login</code>
            </div>
          )}
        </div>

        {/* Git Section */}
        <div className="settings-section">
          <div className="settings-section-title">Git</div>
          <div className="settings-section-desc">
            Controls how agents create branches and merge work.
          </div>
          <label className="settings-field">
            <span className="settings-label">Working Directory</span>
            <input
              type="text"
              value={workingDirectory}
              onChange={(e) => setWorkingDirectory(e.target.value)}
              placeholder="/path/to/salesforce/project"
              className="settings-input"
            />
          </label>
          <div className="settings-field-row">
            <label className="settings-field">
              <span className="settings-label">Base Branch</span>
              <input
                type="text"
                value={baseBranch}
                onChange={(e) => setBaseBranch(e.target.value)}
                placeholder="main"
                className="settings-input"
              />
            </label>
            <label className="settings-field">
              <span className="settings-label">Merge Strategy</span>
              <select
                value={mergeStrategy}
                onChange={(e) => setMergeStrategy(e.target.value as 'squash' | 'merge')}
                className="settings-input"
              >
                <option value="squash">Squash</option>
                <option value="merge">Merge</option>
              </select>
            </label>
          </div>
        </div>

        {/* Org Pool Section */}
        <div className="settings-section">
          <div className="settings-section-title">Scratch Org Pool</div>
          <div className="settings-section-desc">
            Manage Salesforce scratch orgs for agent testing.
          </div>
          <div className="settings-field-row">
            <label className="settings-field">
              <span className="settings-label">Max Orgs</span>
              <input
                type="number"
                value={maxOrgs}
                onChange={(e) => setMaxOrgs(parseInt(e.target.value) || 1)}
                min={1}
                max={20}
                className="settings-input"
              />
            </label>
            <label className="settings-field">
              <span className="settings-label">Duration (days)</span>
              <input
                type="number"
                value={defaultDuration}
                onChange={(e) => setDefaultDuration(parseInt(e.target.value) || 1)}
                min={1}
                max={30}
                className="settings-input"
              />
            </label>
          </div>
          <label className="settings-field">
            <span className="settings-label">Scratch Def Path</span>
            <input
              type="text"
              value={scratchDefPath}
              onChange={(e) => setScratchDefPath(e.target.value)}
              placeholder="config/project-scratch-def.json"
              className="settings-input"
            />
          </label>
        </div>

        {/* Deathmark Section */}
        <div className="settings-section">
          <div className="settings-section-title">Deathmark (Salesforce Sync)</div>
          <div className="settings-section-desc">
            Connect to a Salesforce org to sync tickets automatically.
          </div>
          <label className="settings-field">
            <span className="settings-label">Instance URL</span>
            <input
              type="text"
              value={dmInstanceUrl}
              onChange={(e) => setDmInstanceUrl(e.target.value)}
              placeholder="https://myorg.my.salesforce.com"
              className="settings-input"
            />
          </label>
          <div className="settings-field-row">
            <label className="settings-field">
              <span className="settings-label">Object Name</span>
              <input
                type="text"
                value={dmObjectName}
                onChange={(e) => setDmObjectName(e.target.value)}
                placeholder="Case"
                className="settings-input"
              />
            </label>
            <label className="settings-field">
              <span className="settings-label">Access Token</span>
              <input
                type="password"
                value={dmAccessToken}
                onChange={(e) => setDmAccessToken(e.target.value)}
                placeholder="Session ID or OAuth token"
                className="settings-input"
              />
            </label>
          </div>
          {dmInstanceUrl && (
            <button className="btn-secondary" onClick={handleTestDeathmark}>
              Test Connection
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
