import React, { useState, useEffect, useCallback, useMemo } from 'react';
import type { Camp, Conscript, Directive, DirectiveRun } from '../../shared/types';
import CampBrowserEmbed from './CampBrowserEmbed';
import PRReviewView from './PRReviewView';
import DiffView from './DiffView';

interface CampAuditViewProps {
  selectedCampAlias: string | null;
  onCampSelected: (alias: string | null) => void;
  focusConscriptId?: string;
}

interface EnrichedRun extends DirectiveRun {
  directive?: Directive | null;
  conscript?: Conscript | null;
}

export default function CampAuditView({ selectedCampAlias, onCampSelected, focusConscriptId }: CampAuditViewProps) {
  const [camps, setCamps] = useState<Camp[]>([]);
  const [conscripts, setConscripts] = useState<Conscript[]>([]);
  const [allRuns, setAllRuns] = useState<DirectiveRun[]>([]);
  const [enrichedRuns, setEnrichedRuns] = useState<EnrichedRun[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string>('');
  const [loading, setLoading] = useState(true);

  // Load camps, conscripts, and runs
  const refresh = useCallback(async () => {
    try {
      const [campList, conscriptList, runList] = await Promise.all([
        window.sweatshop.camps.list(),
        window.sweatshop.conscripts.list(),
        window.sweatshop.runs.list(),
      ]);
      setCamps(campList);
      setConscripts(conscriptList);
      setAllRuns(runList);
    } catch (err) {
      console.error('CampAuditView refresh failed:', err);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 10_000);
    return () => clearInterval(id);
  }, [refresh]);

  // Subscribe to conscript status changes
  useEffect(() => {
    window.sweatshop.conscripts.onStatusChanged(() => refresh());
  }, [refresh]);

  // Clear work item when camp changes
  useEffect(() => {
    setSelectedRunId('');
  }, [selectedCampAlias]);

  // Auto-focus tribunal for a specific conscript (QA_READY auto-nav)
  useEffect(() => {
    if (!focusConscriptId) return;
    const run = enrichedRuns.find((r) => r.conscriptId === focusConscriptId);
    if (run) {
      setSelectedRunId(run.id);
    }
  }, [focusConscriptId, enrichedRuns]);

  // Filter runs for selected camp and enrich with directive/conscript data
  useEffect(() => {
    if (!selectedCampAlias) {
      setEnrichedRuns([]);
      return;
    }

    const campRuns = allRuns.filter((r) => r.campAlias === selectedCampAlias);

    (async () => {
      const enriched: EnrichedRun[] = await Promise.all(
        campRuns.map(async (run) => {
          const [directive, conscript] = await Promise.all([
            window.sweatshop.directives.get(run.directiveId),
            window.sweatshop.conscripts.get(run.conscriptId),
          ]);
          return { ...run, directive, conscript };
        })
      );
      setEnrichedRuns(enriched);
    })();
  }, [selectedCampAlias, allRuns]);

  // Conscript map for camp picker display
  const conscriptMap = useMemo(() => {
    const map = new Map<string, Conscript>();
    conscripts.forEach((c) => map.set(c.id, c));
    return map;
  }, [conscripts]);

  // Runs eligible for tribunal (reviewable work items)
  const tribunalRuns = enrichedRuns.filter((r) => {
    if (!r.conscript) return false;
    return ['QA_READY', 'APPROVED', 'MERGED'].includes(r.conscript.status)
      || r.status === 'completed'
      || r.status === 'failed';
  });

  const [activeTab, setActiveTab] = useState<'browse' | 'tribunal'>('browse');
  const [showStoryDetails, setShowStoryDetails] = useState(false);

  // Hide browser when viewing tribunal tab, show when viewing browse tab
  useEffect(() => {
    if (activeTab === 'tribunal') {
      window.sweatshop.browser.hideAll();
    }
  }, [activeTab]);

  // Auto-switch to tribunal tab when a work item is selected
  useEffect(() => {
    if (selectedRunId) {
      setActiveTab('tribunal');
    }
  }, [selectedRunId]);

  const handleCampChange = (alias: string) => {
    onCampSelected(alias || null);
    setSelectedRunId('');
    setEnrichedRuns([]);
    setActiveTab('browse');
  };

  const handleWorkItemChange = (runId: string) => {
    setSelectedRunId(runId);
  };

  const selectedRun = enrichedRuns.find((r) => r.id === selectedRunId) || null;

  const renderStoryDetails = (run: EnrichedRun) => {
    const d = run.directive;
    if (!d) return null;
    return (
      <div className="tribunal-story-details">
        <button
          className="tribunal-story-toggle"
          onClick={() => setShowStoryDetails(!showStoryDetails)}
        >
          <span className="tribunal-story-arrow">{showStoryDetails ? '\u25BE' : '\u25B8'}</span>
          <span className="tribunal-story-title">{d.title}</span>
          {d.labels.length > 0 && (
            <span className="tribunal-story-labels">
              {d.labels.map((l) => (
                <span key={l} className="tribunal-story-label">{l}</span>
              ))}
            </span>
          )}
          <span className={`tribunal-story-priority tribunal-story-priority--${d.priority}`}>
            {d.priority}
          </span>
          {run.conscript && (
            <span className="tribunal-story-worker">{run.conscript.name}</span>
          )}
          {run.reworkCount > 0 && (
            <span className="tribunal-story-rework">
              {run.reworkCount} rework{run.reworkCount !== 1 ? 's' : ''}
            </span>
          )}
        </button>
        {showStoryDetails && (
          <div className="tribunal-story-body">
            {d.description && (
              <div className="tribunal-story-section">
                <div className="tribunal-story-section-label">Description</div>
                <div className="tribunal-story-text">{d.description}</div>
              </div>
            )}
            {d.acceptanceCriteria && (
              <div className="tribunal-story-section">
                <div className="tribunal-story-section-label">Acceptance Criteria</div>
                <div className="tribunal-story-text">{d.acceptanceCriteria}</div>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  const renderContent = () => {
    if (!selectedCampAlias) {
      return (
        <div className="camp-audit-empty">
          <div className="camp-audit-empty-icon">&#9881;</div>
          <h3>Camp Audit</h3>
          <p>Select a camp to browse its Salesforce org, or pick a work item to review.</p>
          <p className="camp-audit-empty-hint">
            You can also click Inspect on a camp card in the Politburo board.
          </p>
        </div>
      );
    }

    if (activeTab === 'tribunal' && selectedRun) {
      if (selectedRun.conscript?.status === 'QA_READY') {
        return <PRReviewView conscriptId={selectedRun.conscriptId} />;
      }
      return (
        <>
          {selectedRun.directive && renderStoryDetails(selectedRun)}
          <DiffView conscriptId={selectedRun.conscriptId} />
        </>
      );
    }

    return <CampBrowserEmbed campAlias={selectedCampAlias} />;
  };

  if (loading) {
    return (
      <div className="camp-audit-view">
        <div className="camp-audit-loading">
          <div className="settings-auth-login-spinner" />
          Loading camps...
        </div>
      </div>
    );
  }

  return (
    <div className="camp-audit-view">
      {/* Selectors row */}
      <div className="camp-audit-selectors">
        <div className="camp-audit-selector-group">
          <span className="camp-audit-selector-label">Camp</span>
          <select
            className="camp-audit-selector"
            value={selectedCampAlias || ''}
            onChange={(e) => handleCampChange(e.target.value)}
          >
            <option value="">Select camp...</option>
            {camps.filter((c) => c.status !== 'expired').map((camp) => {
              const firstConscript = camp.assignedConscriptIds[0];
              const c = firstConscript ? conscriptMap.get(firstConscript) : null;
              return (
                <option key={camp.alias} value={camp.alias}>
                  {camp.alias}{c ? ` — ${c.name} (${c.status})` : ''}
                </option>
              );
            })}
          </select>
        </div>

        <div className="camp-audit-selector-group">
          <span className="camp-audit-selector-label">Work Item</span>
          <select
            className="camp-audit-selector"
            value={selectedRunId}
            onChange={(e) => handleWorkItemChange(e.target.value)}
            disabled={!selectedCampAlias || tribunalRuns.length === 0}
          >
            <option value="">
              {!selectedCampAlias
                ? 'Select a camp first'
                : tribunalRuns.length === 0
                  ? 'No reviewable work items'
                  : 'Select work item...'}
            </option>
            {tribunalRuns.map((run) => (
              <option key={run.id} value={run.id}>
                {run.directive?.title || 'Unknown'} — {run.conscript?.name || '?'} ({run.conscript?.status === 'QA_READY' ? 'Awaiting Verdict' : run.status})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Tabs */}
      {selectedCampAlias && (
        <div className="camp-audit-tabs">
          <button
            className={`camp-audit-tab ${activeTab === 'browse' ? 'active' : ''}`}
            onClick={() => setActiveTab('browse')}
          >
            Browse
          </button>
          <button
            className={`camp-audit-tab ${activeTab === 'tribunal' ? 'active' : ''}`}
            onClick={() => setActiveTab('tribunal')}
            disabled={!selectedRun}
          >
            Tribunal
          </button>
        </div>
      )}

      {/* Content area */}
      <div className="camp-audit-content">
        {renderContent()}
      </div>
    </div>
  );
}
