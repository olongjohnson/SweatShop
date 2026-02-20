import React, { useState, useEffect, useRef, useCallback } from 'react';

interface ProvisioningPaneProps {
  onComplete?: (loginUrl?: string) => void;
}

export default function ProvisioningPane({ onComplete }: ProvisioningPaneProps) {
  const [output, setOutput] = useState<string[]>([]);
  const [running, setRunning] = useState(false);
  const [alias, setAlias] = useState('');
  const [result, setResult] = useState<{ success: boolean; loginUrl?: string } | null>(null);
  const outputRef = useRef<HTMLDivElement>(null);

  // Subscribe to provision output
  useEffect(() => {
    window.sweatshop.orgs.onProvisionOutput((data) => {
      setOutput((prev) => [...prev, data.data]);
    });
  }, []);

  // Auto-scroll output
  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [output]);

  const handleCreate = useCallback(async () => {
    setRunning(true);
    setOutput([]);
    setResult(null);

    const org = await window.sweatshop.orgs.createScratch(alias || undefined);

    if (org) {
      setResult({ success: true, loginUrl: org.loginUrl });
    } else {
      setResult({ success: false });
    }
    setRunning(false);
  }, [alias]);

  const handleOpenOrg = useCallback(() => {
    if (result?.loginUrl && onComplete) {
      onComplete(result.loginUrl);
    }
  }, [result, onComplete]);

  return (
    <div className="provisioning-pane">
      <div className="provisioning-header">
        <h3>Scratch Org Provisioning</h3>
        <p>Create and configure a new Salesforce scratch org</p>
      </div>

      {!running && !result && (
        <div className="provisioning-form">
          <div className="provisioning-field">
            <label>Org Alias (optional)</label>
            <input
              type="text"
              value={alias}
              onChange={(e) => setAlias(e.target.value)}
              placeholder="e.g. my-scratch-org"
              className="settings-input"
            />
          </div>
          <button className="btn-primary" onClick={handleCreate}>
            Create Scratch Org
          </button>
        </div>
      )}

      {output.length > 0 && (
        <div className="provisioning-output" ref={outputRef}>
          {output.map((line, i) => (
            <pre key={i}>{line}</pre>
          ))}
        </div>
      )}

      {running && (
        <div className="provisioning-status">
          <div className="working-indicator" />
          <span>Creating scratch org... this may take a few minutes</span>
        </div>
      )}

      {result && (
        <div className={`provisioning-result ${result.success ? 'success' : 'error'}`}>
          {result.success ? (
            <>
              <span>Scratch org created successfully!</span>
              {result.loginUrl && (
                <button className="btn-primary" onClick={handleOpenOrg}>
                  Open in Browser
                </button>
              )}
              <button className="btn-secondary" onClick={() => { setResult(null); setOutput([]); }}>
                Create Another
              </button>
            </>
          ) : (
            <>
              <span>Failed to create scratch org. Check the output above.</span>
              <button className="btn-secondary" onClick={() => { setResult(null); setOutput([]); }}>
                Try Again
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
