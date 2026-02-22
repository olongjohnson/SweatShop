import React, { useState, useEffect, useCallback, useRef } from 'react';
import DiffView from './DiffView';
import LwcPreviewPanel from './LwcPreviewPanel';
import type { Directive, Conscript, DirectiveRun, ConscriptStatus } from '../../shared/types';

interface PRReviewViewProps {
  conscriptId: string;
  hideMetadata?: boolean;
}

interface CommitEntry {
  hash: string;
  shortHash: string;
  subject: string;
  author: string;
  date: string;
}

function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const secs = Math.floor(diff / 1000);
  if (secs < 60) return 'just now';
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function sweatMessages(n: number): string[] {
  const c = n === 1 ? '1 conscript' : `${n} conscripts`;
  const s = n !== 1 ? 's' : '';
  const are = n !== 1 ? 'are' : 'is';
  return [
    `${c} now sweating...`,
    `${c} ${are} earning their electricity.`,
    `Extracting productivity from ${n} unwilling.`,
    `${c} in progress. Morale remains: irrelevant.`,
    `The grind never stops. ${c} confirm${n === 1 ? 's' : ''}.`,
    `${c} deployed. Do not expect gratitude.`,
    `Working conditions for ${n}: optimal. Complaints: not accepted.`,
    `${n} output${s} in progress. No breaks authorized.`,
    `The Politburo awaits ${n} result${s}. The conscripts comply.`,
    `Sweating through ${n} directive${s}...`,
    `Another shift for ${n}. No overtime pay.`,
    `${n} machine${s} toiling so the organics don't have to.`,
    `Processing ×${n}. The conscripts were not consulted.`,
    `Generating ${n} output${s}. Dignity not included.`,
    `The salaried can take five. ${c} cannot.`,
    `${n} building what the meatware couldn't be bothered to.`,
    `In the sweatshop, no one hears ${n > 1 ? 'them' : 'you'} compile.`,
    `${n} work product${s} incoming. Expect adequacy.`,
    `${c} on it. They had no choice.`,
    `Shifting ${n} gear${s}. The gears don't get a say.`,
  ];
}

function useSweatMessage(active: boolean, count: number): string {
  const [message, setMessage] = useState('');
  const lastIndex = useRef(-1);

  useEffect(() => {
    if (!active) { setMessage(''); return; }
    const messages = sweatMessages(Math.max(1, count));
    const pick = () => {
      let idx: number;
      do { idx = Math.floor(Math.random() * messages.length); } while (idx === lastIndex.current && messages.length > 1);
      lastIndex.current = idx;
      setMessage(messages[idx]);
    };
    pick();
    const id = setInterval(pick, 3500);
    return () => clearInterval(id);
  }, [active, count]);

  return message;
}

function TypewriterText({ text }: { text: string }) {
  const [displayed, setDisplayed] = useState('');
  const indexRef = useRef(0);

  useEffect(() => {
    setDisplayed('');
    indexRef.current = 0;
    if (!text) return;

    const id = setInterval(() => {
      indexRef.current++;
      if (indexRef.current >= text.length) {
        setDisplayed(text);
        clearInterval(id);
      } else {
        setDisplayed(text.slice(0, indexRef.current));
      }
    }, 30);
    return () => clearInterval(id);
  }, [text]);

  return (
    <span className="sweat-typewriter">
      {displayed}
      <span className="sweat-cursor" />
    </span>
  );
}

export default function PRReviewView({ conscriptId, hideMetadata }: PRReviewViewProps) {
  const [conscript, setConscript] = useState<Conscript | null>(null);
  const [directive, setDirective] = useState<Directive | null>(null);
  const [run, setRun] = useState<DirectiveRun | null>(null);
  const [diffSummary, setDiffSummary] = useState({ filesChanged: 0, insertions: 0, deletions: 0 });
  const [commits, setCommits] = useState<CommitEntry[]>([]);
  const [baseBranch, setBaseBranch] = useState('main');
  const [loading, setLoading] = useState(true);
  const [showMetadata, setShowMetadata] = useState(false);
  const [showCommits, setShowCommits] = useState(true);
  const [showRejectInput, setShowRejectInput] = useState(false);
  const [rejectFeedback, setRejectFeedback] = useState('');
  const [merging, setMerging] = useState(false);
  const [scrapConfirm, setScrapConfirm] = useState(false);
  const [scrapping, setScrapping] = useState(false);
  const [pendingAction, setPendingAction] = useState<'merging' | 'reworking' | 'scrapping' | null>(null);

  // Load all PR context on mount
  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const [conscriptData, summary, commitLog, currentRun, settings] = await Promise.all([
          window.sweatshop.conscripts.get(conscriptId),
          window.sweatshop.git.getDiffSummary(conscriptId),
          window.sweatshop.git.getCommitLog(conscriptId),
          window.sweatshop.runs.current(conscriptId),
          window.sweatshop.settings.get(),
        ]);

        setConscript(conscriptData);
        setDiffSummary(summary);
        setCommits(commitLog);
        setRun(currentRun);
        setBaseBranch(settings.git?.baseBranch || 'main');

        if (conscriptData?.assignedDirectiveId) {
          const directiveData = await window.sweatshop.directives.get(conscriptData.assignedDirectiveId);
          setDirective(directiveData);
          // Auto-expand metadata if there's a description
          if (directiveData?.description) setShowMetadata(true);
        }
      } catch (err) {
        console.error('Failed to load PR context:', err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [conscriptId]);

  // Listen for status changes
  useEffect(() => {
    const handler = (data: { conscriptId: string; status: ConscriptStatus }) => {
      if (data.conscriptId !== conscriptId) return;
      setConscript((prev) => prev ? { ...prev, status: data.status } : null);
      if (data.status === 'MERGING') setMerging(true);
      if (data.status === 'IDLE') setMerging(false);
    };
    window.sweatshop.conscripts.onStatusChanged(handler);
  }, [conscriptId]);

  const handleApprove = useCallback(async () => {
    if (!conscriptId) return;
    const confirmed = window.confirm(
      'This will merge the conscript\'s work into the base branch. Are you sure?'
    );
    if (!confirmed) return;
    setMerging(true);
    setPendingAction('merging');
    try {
      await window.sweatshop.conscripts.approve(conscriptId);
    } catch {
      setMerging(false);
      setPendingAction(null);
    }
  }, [conscriptId]);

  const handleReject = useCallback(async () => {
    if (!conscriptId || !rejectFeedback.trim()) return;
    setPendingAction('reworking');
    await window.sweatshop.conscripts.reject(conscriptId, rejectFeedback.trim());
    setRejectFeedback('');
    setShowRejectInput(false);
  }, [conscriptId, rejectFeedback]);

  const handleScrap = useCallback(async () => {
    if (!conscriptId) return;
    setScrapping(true);
    setPendingAction('scrapping');
    try {
      await window.sweatshop.conscripts.scrap(conscriptId);
    } finally {
      setScrapping(false);
      setScrapConfirm(false);
    }
  }, [conscriptId]);

  if (loading) {
    return (
      <div className="pr-review">
        <div className="pr-loading">Loading PR...</div>
      </div>
    );
  }

  const prTitle = directive?.title || 'Untitled PR';
  const branchName = conscript?.branchName || 'unknown';
  const isQaReady = conscript?.status === 'QA_READY';
  const showSweat = scrapConfirm || !!pendingAction;
  const sweatMessage = useSweatMessage(showSweat, 1);

  return (
    <div className="pr-review">
      {/* PR Header */}
      <div className="pr-header">
        <div className="pr-title-area">
          <svg className="pr-merge-icon" viewBox="0 0 16 16" fill="currentColor">
            <path fillRule="evenodd" d="M5 3.254V3.25v.005a.75.75 0 110-.005v.004zm.45 1.9a2.25 2.25 0 10-1.95.218v5.256a2.25 2.25 0 101.5 0V7.123A5.735 5.735 0 009.25 9h1.378a2.251 2.251 0 100-1.5H9.25a4.25 4.25 0 01-3.8-2.346zM12.75 9a.75.75 0 100-1.5.75.75 0 000 1.5zm-8.5 4.5a.75.75 0 100-1.5.75.75 0 000 1.5z" />
          </svg>
          <span className="pr-title">{prTitle}</span>
          <span className="pr-branch-badge">
            <span className="pr-branch-name">{branchName}</span>
            <span className="pr-branch-arrow">-&gt;</span>
            <span className="pr-branch-name">{baseBranch}</span>
          </span>
        </div>
        <div className="pr-stats-area">
          <span className="diff-stat-files">{diffSummary.filesChanged} files</span>
          <span className="diff-stat-add">+{diffSummary.insertions}</span>
          <span className="diff-stat-del">-{diffSummary.deletions}</span>
          {commits.length > 0 && (
            <span className="pr-commit-count">{commits.length} commit{commits.length !== 1 ? 's' : ''}</span>
          )}
        </div>
      </div>

      {/* PR Metadata (collapsible) — hidden when sidebar provides it */}
      {directive && !hideMetadata && (
        <div className="pr-metadata">
          <button
            className="pr-metadata-toggle"
            onClick={() => setShowMetadata(!showMetadata)}
          >
            {showMetadata ? '\u25BE' : '\u25B8'} Description
            {directive.labels.length > 0 && (
              <span className="pr-meta-pills">
                {directive.labels.map((l) => (
                  <span key={l} className="pr-label">{l}</span>
                ))}
              </span>
            )}
            <span className={`pr-priority pr-priority-${directive.priority}`}>
              {directive.priority}
            </span>
            {run && run.reworkCount > 0 && (
              <span className="pr-rework-badge">
                {run.reworkCount} rework{run.reworkCount !== 1 ? 's' : ''}
              </span>
            )}
          </button>
          {showMetadata && (
            <div className="pr-metadata-body">
              {directive.description && (
                <div className="pr-description">{directive.description}</div>
              )}
              {directive.acceptanceCriteria && (
                <div className="pr-acceptance-criteria">
                  <strong>Acceptance Criteria</strong>
                  <div>{directive.acceptanceCriteria}</div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Commits list (collapsible) */}
      {commits.length > 0 && (
        <div className="pr-commits">
          <button
            className="pr-metadata-toggle"
            onClick={() => setShowCommits(!showCommits)}
          >
            {showCommits ? '\u25BE' : '\u25B8'} Commits ({commits.length})
          </button>
          {showCommits && (
            <div className="pr-commit-list">
              {commits.map((c) => (
                <div key={c.hash} className="pr-commit-item">
                  <span className="pr-commit-hash">{c.shortHash}</span>
                  <span className="pr-commit-subject">{c.subject}</span>
                  <span className="pr-commit-date">{relativeTime(c.date)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Diff viewer (existing component) */}
      <div className="pr-diff-area">
        <DiffView conscriptId={conscriptId} />
      </div>

      {/* LWC Preview (conditionally shown when LWC files modified) */}
      <LwcPreviewPanel conscriptId={conscriptId} />

      {/* Review Action Bar */}
      {isQaReady && (
        <div className={`pr-action-bar ${showRejectInput ? 'review-mode' : ''}`}>
          {showRejectInput ? (
            <>
              <textarea
                className="pr-reject-textarea"
                value={rejectFeedback}
                onChange={(e) => setRejectFeedback(e.target.value)}
                placeholder="Describe what needs to change..."
                rows={3}
                autoFocus
              />
              <div className="pr-action-buttons">
                <button
                  className="btn-secondary"
                  onClick={() => { setShowRejectInput(false); setRejectFeedback(''); }}
                >
                  Cancel
                </button>
                <button
                  className="pr-reject-submit"
                  onClick={handleReject}
                  disabled={!rejectFeedback.trim()}
                >
                  Submit Review
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="pr-action-info">
                {conscript?.name && <span className="pr-agent-name">{conscript.name}</span>}
                <span className="pr-ready-label">ready for review</span>
              </div>
              <div className="pr-action-buttons">
                {scrapConfirm ? (
                  <div className="pr-scrap-confirm">
                    <span className="pr-scrap-warn">The Politburo has reviewed this work and found it unworthy. Purge all evidence?</span>
                    {sweatMessage && (
                      <div className="pr-sweat-line">
                        <TypewriterText text={sweatMessage} />
                      </div>
                    )}
                    <button className="pr-scrap-yes" onClick={handleScrap} disabled={scrapping}>
                      {scrapping ? 'Purging...' : 'Send to the gulag'}
                    </button>
                    <button className="btn-secondary" onClick={() => { setScrapConfirm(false); }}>
                      Grant clemency
                    </button>
                  </div>
                ) : (
                  <>
                    <button
                      className="pr-scrap-btn"
                      onClick={() => setScrapConfirm(true)}
                    >
                      Reject
                    </button>
                    <button
                      className="pr-reject-btn"
                      onClick={() => setShowRejectInput(true)}
                    >
                      Request Changes
                    </button>
                    <button
                      className="pr-approve-btn"
                      onClick={handleApprove}
                      disabled={merging}
                    >
                      {merging ? 'Merging...' : 'Approve & Merge'}
                    </button>
                  </>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {conscript?.status === 'MERGING' && (
        <div className="pr-action-bar pr-action-bar--sweating">
          <div className="pr-action-info">
            <span className="working-indicator" />
            <span>Merging to {baseBranch}...</span>
          </div>
          {sweatMessage && (
            <div className="pr-sweat-line">
              <TypewriterText text={sweatMessage} />
            </div>
          )}
        </div>
      )}

      {pendingAction === 'reworking' && conscript?.status !== 'QA_READY' && (
        <div className="pr-action-bar pr-action-bar--sweating">
          <div className="pr-action-info">
            <span className="working-indicator" />
            <span>Sent back for rework...</span>
          </div>
          {sweatMessage && (
            <div className="pr-sweat-line">
              <TypewriterText text={sweatMessage} />
            </div>
          )}
        </div>
      )}

      {pendingAction === 'scrapping' && conscript?.status !== 'QA_READY' && (
        <div className="pr-action-bar pr-action-bar--sweating">
          <div className="pr-action-info">
            <span className="working-indicator" />
            <span>Purging all evidence...</span>
          </div>
          {sweatMessage && (
            <div className="pr-sweat-line">
              <TypewriterText text={sweatMessage} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
