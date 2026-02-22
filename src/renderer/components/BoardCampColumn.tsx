import React, { useState, useEffect, useCallback, useRef } from 'react';
import type { Camp, Conscript, Directive, DevHubInfo, SweatShopSettings } from '../../shared/types';
import type { DragState, DropHandlers } from '../hooks/useBoardDragDrop';

const POLL_INTERVAL = 30_000;

function daysUntil(dateStr?: string): number | null {
  if (!dateStr) return null;
  const diff = new Date(dateStr).getTime() - Date.now();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

function expiryLabel(dateStr?: string): string {
  const days = daysUntil(dateStr);
  if (days === null) return 'No expiry';
  if (days < 0) return 'Expired';
  if (days === 0) return 'Expires today';
  if (days === 1) return 'Expires tomorrow';
  return `Expires in ${days} days`;
}

interface Props {
  conscripts: Conscript[];
  directives: Directive[];
  onRefresh: () => void;
  onInspectCamp?: (alias: string) => void;
  dragHandlers: DropHandlers;
  dragState: DragState;
}

export default function BoardCampColumn({ conscripts, directives, onRefresh, onInspectCamp, dragHandlers, dragState }: Props) {
  const [info, setInfo] = useState<DevHubInfo | null>(null);
  const [camps, setCamps] = useState<Camp[]>([]);
  const [loading, setLoading] = useState(true);

  // Provision form
  const [showProvision, setShowProvision] = useState(false);
  const [newAlias, setNewAlias] = useState('');
  const [provisioning, setProvisioning] = useState(false);
  const [provisionOutput, setProvisionOutput] = useState<string[]>([]);
  const outputRef = useRef<HTMLDivElement>(null);

  // Delete state
  const [deleting, setDeleting] = useState<string | null>(null);
  const [dropHoverId, setDropHoverId] = useState<string | null>(null);

  // Open path setting
  const [campOpenPath, setCampOpenPath] = useState('');

  const conscriptMap = new Map(conscripts.map((a) => [a.id, a.name]));

  const refresh = useCallback(async () => {
    try {
      const [hubInfo, campList] = await Promise.all([
        window.sweatshop.camps.getDevHubInfo(),
        window.sweatshop.camps.sync(),
      ]);
      setInfo(hubInfo);
      setCamps(campList);
    } catch {
      // silent
    }
    setLoading(false);
    onRefresh();
  }, [onRefresh]);

  // Load open-path setting
  useEffect(() => {
    window.sweatshop.settings.get().then((s: SweatShopSettings) => {
      setCampOpenPath(s.campPool?.openPath || '');
    });
  }, []);

  const saveOpenPath = () => {
    window.sweatshop.settings.update({
      campPool: { openPath: campOpenPath || undefined },
    });
  };

  // Initial load + polling
  useEffect(() => {
    refresh();
    const id = setInterval(refresh, POLL_INTERVAL);
    return () => clearInterval(id);
  }, [refresh]);

  // Provision output listener
  useEffect(() => {
    window.sweatshop.camps.onProvisionOutput((data) => {
      if (data.data) setProvisionOutput((prev) => [...prev, data.data]);
    });
  }, []);

  // Auto-scroll provision output
  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [provisionOutput]);

  const handleProvision = async () => {
    setProvisioning(true);
    setProvisionOutput([]);
    const camp = await window.sweatshop.camps.provision(newAlias || undefined);
    setProvisioning(false);
    if (camp) {
      setNewAlias('');
      setShowProvision(false);
      setProvisionOutput([]);
      await refresh();
      onRefresh();
    }
  };

  const handleDelete = async (alias: string) => {
    setDeleting(alias);
    await window.sweatshop.camps.deleteCamp(alias);
    setDeleting(null);
    await refresh();
    onRefresh();
  };

  const handleOpen = async (alias: string) => {
    const url = await window.sweatshop.camps.openCamp(alias);
    if (url) window.open(url, '_blank');
  };

  const handleOpenDevHub = async () => {
    const url = await window.sweatshop.camps.openDevHub();
    if (url) window.open(url, '_blank');
  };

  const handleRelease = async (campId: string, conscriptId?: string) => {
    if (conscriptId) {
      await window.sweatshop.camps.unassignFromConscript(campId, conscriptId);
    } else {
      // Release all conscripts from this camp
      const camp = camps.find((c) => c.id === campId);
      if (camp) {
        for (const cid of camp.assignedConscriptIds) {
          await window.sweatshop.camps.unassignFromConscript(campId, cid);
        }
      }
    }
    await refresh();
    onRefresh();
  };

  const activeCamps = camps.filter((o) => o.status !== 'expired');
  const expiredCamps = camps.filter((o) => o.status === 'expired');

  const activeUsed = info?.limits.activeScratchOrgs.used ?? 0;
  const activeMax = info?.limits.activeScratchOrgs.max ?? 0;
  const dailyUsed = info?.limits.dailyScratchOrgs.used ?? 0;
  const dailyMax = info?.limits.dailyScratchOrgs.max ?? 0;

  const activeLimitClass = activeUsed >= activeMax ? 'org-limit-badge--full' : activeUsed >= activeMax * 0.7 ? 'org-limit-badge--warn' : '';
  const dailyLimitClass = dailyUsed >= dailyMax ? 'org-limit-badge--full' : dailyUsed >= dailyMax * 0.7 ? 'org-limit-badge--warn' : '';

  return (
    <div className="board-column">
      <div className="board-column-header">
        <h3>Camps</h3>
        <div className="board-column-actions">
          <button
            className="btn-primary board-btn-sm"
            onClick={() => setShowProvision(!showProvision)}
            disabled={provisioning}
          >
            + Provision
          </button>
        </div>
      </div>

      {/* DevHub + Limits bar */}
      <div className="board-org-info-bar">
        {info?.devHub ? (
          <button
            className={`org-devhub-pill ${info.devHub.connected ? 'org-devhub-ok' : 'org-devhub-err'}`}
            onClick={handleOpenDevHub}
            title="Open DevHub in browser"
          >
            <span className="org-devhub-dot" />
            {info.devHub.name}
            <span className="org-devhub-open-icon">&#8599;</span>
          </button>
        ) : !loading ? (
          <div className="org-devhub-pill org-devhub-err">
            <span className="org-devhub-dot" />
            No DevHub
          </div>
        ) : null}
        {info && (
          <div className="board-org-limits">
            <span className={`org-limit-badge ${activeLimitClass}`}>
              Active: {activeUsed}/{activeMax}
            </span>
            <span className={`org-limit-badge ${dailyLimitClass}`}>
              Daily: {dailyUsed}/{dailyMax}
            </span>
          </div>
        )}
      </div>

      {/* Open path setting */}
      <div className="board-org-open-path">
        <input
          type="text"
          value={campOpenPath}
          onChange={(e) => setCampOpenPath(e.target.value)}
          onBlur={saveOpenPath}
          placeholder="Open path, e.g. /lightning/n/CognitoPM"
          className="board-org-path-input"
          title="Default page to open when launching a camp"
        />
      </div>

      {/* Provision form */}
      {showProvision && (
        <div className="board-org-provision-form">
          {!provisioning ? (
            <>
              <div className="board-org-provision-row">
                <input
                  type="text"
                  className="board-org-provision-input"
                  placeholder="Alias (optional)"
                  value={newAlias}
                  onChange={(e) => setNewAlias(e.target.value)}
                />
                <button className="btn-primary board-btn-sm" onClick={handleProvision}>Go</button>
                <button className="btn-secondary board-btn-sm" onClick={() => { setShowProvision(false); setProvisionOutput([]); }}>Cancel</button>
              </div>
              {provisionOutput.length > 0 && (
                <div className="board-org-provision-output" ref={outputRef}>
                  {provisionOutput.map((line, i) => <span key={i}>{line}</span>)}
                </div>
              )}
            </>
          ) : (
            <>
              <div className="board-org-provision-progress">
                <div className="settings-auth-login-spinner" />
                <span>Provisioning...</span>
              </div>
              {provisionOutput.length > 0 && (
                <div className="board-org-provision-output" ref={outputRef}>
                  {provisionOutput.map((line, i) => <span key={i}>{line}</span>)}
                </div>
              )}
            </>
          )}
        </div>
      )}

      <div className="board-column-body">
        {loading && (
          <div className="board-empty">Loading camp data...</div>
        )}

        {!loading && activeCamps.length === 0 && expiredCamps.length === 0 && (
          <div className="board-empty">
            No camps. Click + Provision to create one.
          </div>
        )}

        {activeCamps.map((camp) => {
          const days = daysUntil(camp.expiresAt);
          const isWarning = days !== null && days <= 2;
          const assignedConscriptNames = camp.assignedConscriptIds
            .map((cid) => conscriptMap.get(cid))
            .filter(Boolean) as string[];
          const assignedConscriptsList = camp.assignedConscriptIds
            .map((cid) => conscripts.find((c) => c.id === cid))
            .filter(Boolean) as Conscript[];
          const assignedDirectives = assignedConscriptsList
            .map((c) => c.assignedDirectiveId ? directives.find((d) => d.id === c.assignedDirectiveId) : null)
            .filter(Boolean) as Directive[];

          const isDraggable = camp.status === 'available';
          const isDropTarget = dropHoverId === camp.id;

          return (
            <div
              key={camp.id || camp.alias}
              className={`board-org-card board-org-card--${camp.status} ${isDropTarget ? 'board-drop-target' : ''}`}
              data-entity-type="camp"
              data-entity-id={camp.id}
              draggable={isDraggable}
              onDragStart={isDraggable ? (e) => dragHandlers.onDragStart('camp', camp.id, e) : undefined}
              onDragEnd={dragHandlers.onDragEnd}
              onDragOver={(e) => { if (dragHandlers.canDrop('camp', camp.id)) { e.preventDefault(); setDropHoverId(camp.id); } }}
              onDragEnter={(e) => { if (dragHandlers.canDrop('camp', camp.id)) { e.preventDefault(); setDropHoverId(camp.id); } }}
              onDragLeave={() => setDropHoverId((prev) => prev === camp.id ? null : prev)}
              onDrop={(e) => { dragHandlers.onDrop('camp', camp.id, e); setDropHoverId(null); }}
            >
              <div className="board-org-header">
                <span className="board-org-alias">{camp.alias}</span>
                <div className="board-org-badges">
                  {camp.edition && <span className="board-org-edition">{camp.edition}</span>}
                  <span className={`board-org-status board-org-status--${camp.status}`}>
                    {camp.status}
                  </span>
                </div>
              </div>

              <div className="board-org-details">
                {camp.username && (
                  <div className="board-org-detail-row">
                    <span className="board-org-detail-label">User</span>
                    <span className="board-org-detail-value">{camp.username}</span>
                  </div>
                )}
                {camp.instanceUrl && (
                  <div className="board-org-detail-row">
                    <span className="board-org-detail-label">URL</span>
                    <span className="board-org-detail-value board-org-url">{camp.instanceUrl.replace('https://', '')}</span>
                  </div>
                )}
                {camp.namespace && (
                  <div className="board-org-detail-row">
                    <span className="board-org-detail-label">NS</span>
                    <span className="board-org-detail-value">{camp.namespace}</span>
                  </div>
                )}
                <div className="board-org-detail-row">
                  <span className="board-org-detail-label">Expiry</span>
                  <span className={`board-org-detail-value ${isWarning ? 'board-org-expiry--warn' : ''}`}>
                    {expiryLabel(camp.expiresAt)}
                  </span>
                </div>
                {assignedConscriptNames.length > 0 && (
                  <div className="board-org-detail-row">
                    <span className="board-org-detail-label">Conscripts</span>
                    <div className="board-org-conscript-list">
                      {assignedConscriptNames.map((name, i) => (
                        <span key={i} className="board-assigned-badge">{name}</span>
                      ))}
                      <span className="board-org-occupancy">{assignedConscriptNames.length}</span>
                    </div>
                  </div>
                )}
                {assignedDirectives.map((dir, i) => (
                  <div key={dir.id} className="board-org-detail-row">
                    <span className="board-org-detail-label">{i === 0 ? 'Directives' : ''}</span>
                    <span className="board-org-detail-value">
                      {dir.title.length > 30 ? dir.title.slice(0, 30) + '...' : dir.title}
                    </span>
                  </div>
                ))}
              </div>

              <div className="board-org-actions">
                {onInspectCamp && (
                  <button className="btn-primary board-btn-sm" onClick={() => onInspectCamp(camp.alias)}>Inspect</button>
                )}
                <button className="btn-secondary board-btn-sm" onClick={() => handleOpen(camp.alias)}>Open</button>
                {camp.status === 'leased' && (
                  <button className="btn-secondary board-btn-sm" onClick={() => handleRelease(camp.id)}>Release All</button>
                )}
                {deleting === camp.alias ? (
                  <span className="board-org-deleting">Deleting...</span>
                ) : (
                  <button className="board-btn-danger board-btn-sm" onClick={() => handleDelete(camp.alias)}>Delete</button>
                )}
              </div>
            </div>
          );
        })}

        {expiredCamps.length > 0 && (
          <>
            <div className="board-section-label">Expired</div>
            {expiredCamps.map((camp) => (
              <div key={camp.id || camp.alias} className="board-org-card board-org-card--expired">
                <div className="board-org-header">
                  <span className="board-org-alias">{camp.alias}</span>
                  <span className="board-org-status board-org-status--expired">expired</span>
                </div>
                <div className="board-org-actions">
                  {deleting === camp.alias ? (
                    <span className="board-org-deleting">Deleting...</span>
                  ) : (
                    <button className="board-btn-danger board-btn-sm" onClick={() => handleDelete(camp.alias)}>Remove</button>
                  )}
                </div>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
