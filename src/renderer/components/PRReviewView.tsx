import React, { useState, useEffect, useCallback } from 'react';
import DiffView from './DiffView';
import LwcPreviewPanel from './LwcPreviewPanel';
import type { Directive, Conscript, DirectiveRun, ConscriptStatus } from '../../shared/types';

interface PRReviewViewProps {
  conscriptId: string;
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

export default function PRReviewView({ conscriptId }: PRReviewViewProps) {
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
    try {
      await window.sweatshop.conscripts.approve(conscriptId);
    } catch {
      setMerging(false);
    }
  }, [conscriptId]);

  const handleReject = useCallback(async () => {
    if (!conscriptId || !rejectFeedback.trim()) return;
    await window.sweatshop.conscripts.reject(conscriptId, rejectFeedback.trim());
    setRejectFeedback('');
    setShowRejectInput(false);
  }, [conscriptId, rejectFeedback]);

  const handleScrap = useCallback(async () => {
    if (!conscriptId) return;
    setScrapping(true);
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

      {/* PR Metadata (collapsible) */}
      {directive && (
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
                    <button className="pr-scrap-yes" onClick={handleScrap} disabled={scrapping}>
                      {scrapping ? 'Purging...' : 'Send to the gulag'}
                    </button>
                    <button className="btn-secondary" onClick={() => setScrapConfirm(false)}>
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
        <div className="pr-action-bar">
          <div className="pr-action-info">
            <span className="working-indicator" />
            <span>Merging to {baseBranch}...</span>
          </div>
        </div>
      )}
    </div>
  );
}
