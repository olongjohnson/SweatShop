import React, { useState, useEffect } from 'react';
import type { SweatShopSettings } from '../../shared/types';

type AuthState = 'checking' | 'authenticated' | 'unauthenticated' | 'logging-in' | 'error';

export default function SettingsView() {
  const [settings, setSettings] = useState<SweatShopSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Auth
  const [authState, setAuthState] = useState<AuthState>('checking');
  const [authLabel, setAuthLabel] = useState('');
  const [authError, setAuthError] = useState('');

  // Form state
  const [baseBranch, setBaseBranch] = useState('main');
  const [mergeStrategy, setMergeStrategy] = useState<'squash' | 'merge'>('squash');
  const [workingDirectory, setWorkingDirectory] = useState('');
  const [dmInstanceUrl, setDmInstanceUrl] = useState('');
  const [dmObjectName, setDmObjectName] = useState('');
  const [dmAccessToken, setDmAccessToken] = useState('');
  const [dmTesting, setDmTesting] = useState(false);
  const [dmTestResult, setDmTestResult] = useState<{ ok: boolean; msg: string } | null>(null);

  // Camp Pool
  const [allowSharedCamps, setAllowSharedCamps] = useState(false);
  const [maxConscriptsPerCamp, setMaxConscriptsPerCamp] = useState(3);

  const refreshAuth = async () => {
    try {
      const status = await window.sweatshop.claude.authStatus();
      if (status.authenticated) {
        setAuthState('authenticated');
        setAuthLabel(status.method);
        setAuthError('');
      } else {
        setAuthState('unauthenticated');
        setAuthLabel('');
        setAuthError('');
      }
    } catch {
      setAuthState('error');
      setAuthError('Could not check authentication status.');
    }
  };

  useEffect(() => {
    const load = async () => {
      const [s] = await Promise.all([
        window.sweatshop.settings.get(),
        refreshAuth(),
      ]);
      setSettings(s);
      setBaseBranch(s.git?.baseBranch || 'main');
      setMergeStrategy(s.git?.mergeStrategy || 'squash');
      setWorkingDirectory(s.git?.workingDirectory || '');
      setDmInstanceUrl(s.deathmark?.instanceUrl || '');
      setDmObjectName(s.deathmark?.objectName || '');
      setDmAccessToken(s.deathmark?.accessToken || '');
      setAllowSharedCamps(s.campPool?.allowSharedCamps ?? false);
      setMaxConscriptsPerCamp(s.campPool?.maxConscriptsPerCamp ?? 3);
    };
    load();
  }, []);

  // Listen for login output (just to detect completion)
  useEffect(() => {
    window.sweatshop.claude.onLoginOutput((data) => {
      if (data.done) {
        refreshAuth();
      }
    });
  }, []);

  const handleLogin = async () => {
    setAuthState('logging-in');
    setAuthError('');
    const result = await window.sweatshop.claude.login();
    if (!result.success) {
      setAuthState('error');
      setAuthError(result.error || 'Login failed. Please try again.');
    } else {
      await refreshAuth();
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    try {
      const updated = await window.sweatshop.settings.update({
        git: { baseBranch, mergeStrategy, workingDirectory },
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
        campPool: {
          ...settings?.campPool,
          maxCamps: settings?.campPool?.maxCamps ?? 4,
          scratchDefPath: settings?.campPool?.scratchDefPath ?? 'config/project-scratch-def.json',
          defaultDurationDays: settings?.campPool?.defaultDurationDays ?? 7,
          allowSharedCamps,
          maxConscriptsPerCamp,
        },
      });
      setSettings(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } finally {
      setSaving(false);
    }
  };

  const handleBrowseDirectory = async () => {
    const dir = await window.sweatshop.settings.pickDirectory();
    if (dir) setWorkingDirectory(dir);
  };

  const handleTestDeathmark = async () => {
    setDmTesting(true);
    setDmTestResult(null);
    try {
      await window.sweatshop.deathmark.testConnection();
      setDmTestResult({ ok: true, msg: 'Connected successfully' });
    } catch (err: any) {
      setDmTestResult({ ok: false, msg: err.message || 'Connection failed' });
    } finally {
      setDmTesting(false);
      setTimeout(() => setDmTestResult(null), 5000);
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
        {/* ── Authentication ── */}
        <div className="settings-section">
          <div className="settings-section-title">Authentication</div>
          <div className="settings-section-desc">
            Sign in with your Anthropic account to enable conscripts.
          </div>

          {authState === 'checking' && (
            <div className="settings-auth-card">
              <div className="settings-auth-login-spinner" />
              <span className="settings-auth-card-text">Checking authentication...</span>
            </div>
          )}

          {authState === 'authenticated' && (
            <div className="settings-auth-card settings-auth-card--ok">
              <span className="settings-auth-dot settings-auth-dot--ok" />
              <span className="settings-auth-card-text">
                Signed in &mdash; {authLabel}
              </span>
            </div>
          )}

          {authState === 'unauthenticated' && (
            <>
              <div className="settings-auth-card settings-auth-card--warn">
                <span className="settings-auth-dot settings-auth-dot--warn" />
                <span className="settings-auth-card-text">Not signed in</span>
              </div>
              <button className="settings-auth-login-btn" onClick={handleLogin}>
                Sign in with Claude
              </button>
            </>
          )}

          {authState === 'logging-in' && (
            <div className="settings-auth-card">
              <div className="settings-auth-login-spinner" />
              <span className="settings-auth-card-text">
                Complete sign-in in your browser...
              </span>
            </div>
          )}

          {authState === 'error' && (
            <>
              <div className="settings-auth-card settings-auth-card--error">
                <span className="settings-auth-dot settings-auth-dot--error" />
                <span className="settings-auth-card-text">{authError}</span>
              </div>
              <button className="settings-auth-login-btn" onClick={handleLogin}>
                Try Again
              </button>
            </>
          )}
        </div>

        {/* ── Project ── */}
        <div className="settings-section">
          <div className="settings-section-title">Project</div>
          <div className="settings-section-desc">
            Point to your Salesforce project so conscripts know where to work.
          </div>
          <label className="settings-field">
            <span className="settings-label">Working Directory</span>
            <div className="settings-input-row">
              <input
                type="text"
                value={workingDirectory}
                onChange={(e) => setWorkingDirectory(e.target.value)}
                placeholder="/path/to/your/salesforce/project"
                className={`settings-input ${!workingDirectory ? 'settings-input--error' : ''}`}
              />
              <button className="btn-browse" onClick={handleBrowseDirectory}>
                Browse
              </button>
            </div>
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

        {/* ── Salesforce Sync ── */}
        <div className="settings-section">
          <div className="settings-section-title">Salesforce Sync</div>
          <div className="settings-section-desc">
            Pull directives directly from a Salesforce camp.
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
            <div className="settings-test-row">
              <button
                className="btn-secondary"
                onClick={handleTestDeathmark}
                disabled={dmTesting}
              >
                {dmTesting ? 'Testing...' : 'Test Connection'}
              </button>
              {dmTestResult && (
                <span className={`settings-test-result ${dmTestResult.ok ? 'settings-test-ok' : 'settings-test-fail'}`}>
                  {dmTestResult.msg}
                </span>
              )}
            </div>
          )}
        </div>

        {/* ── Camp Pool ── */}
        <div className="settings-section">
          <div className="settings-section-title">Camp Pool</div>
          <div className="settings-section-desc">
            Configure how scratch orgs are shared between conscripts.
          </div>
          <label className="settings-field settings-field--checkbox">
            <input
              type="checkbox"
              checked={allowSharedCamps}
              onChange={(e) => setAllowSharedCamps(e.target.checked)}
            />
            <div>
              <span className="settings-label">Allow shared camps</span>
              <span className="settings-hint">
                Multiple conscripts can work in the same scratch org simultaneously.
              </span>
            </div>
          </label>
          {allowSharedCamps && (
            <label className="settings-field">
              <span className="settings-label">Max conscripts per camp</span>
              <input
                type="number"
                min="2"
                max="10"
                value={maxConscriptsPerCamp}
                onChange={(e) => setMaxConscriptsPerCamp(parseInt(e.target.value) || 3)}
                className="settings-input settings-input--narrow"
              />
            </label>
          )}
        </div>
      </div>
    </div>
  );
}
