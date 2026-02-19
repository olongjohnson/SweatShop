import React, { useState, useEffect } from 'react';
import type { SessionMetrics, RunMetrics, TrendPoint } from '../../shared/types';

function formatDuration(ms: number): string {
  if (ms < 60000) return `${Math.round(ms / 1000)}s`;
  if (ms < 3600000) return `${Math.round(ms / 60000)}m`;
  const h = Math.floor(ms / 3600000);
  const m = Math.round((ms % 3600000) / 60000);
  return `${h}h ${m}m`;
}

function MetricCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="metric-card">
      <div className="metric-value" style={{ color }}>{value}</div>
      <div className="metric-label">{label}</div>
    </div>
  );
}

function BarChart({ data, label }: { data: TrendPoint[]; label: string }) {
  const max = Math.max(...data.map((d) => d.value), 1);

  return (
    <div className="chart-card">
      <div className="chart-title">{label}</div>
      <div className="bar-chart">
        {data.map((d, i) => (
          <div key={i} className="bar-group">
            <div className="bar-wrapper">
              <div
                className="bar"
                style={{ height: `${(d.value / max) * 100}%` }}
                title={`${d.value}`}
              />
            </div>
            <div className="bar-label">{d.period}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function TimeBreakdown({ session }: { session: SessionMetrics }) {
  const total = session.totalActiveDevTimeMs + session.totalHumanWaitTimeMs;
  if (total === 0) return null;

  const devPct = Math.round((session.totalActiveDevTimeMs / total) * 100);
  const waitPct = 100 - devPct;

  return (
    <div className="chart-card">
      <div className="chart-title">Time Breakdown</div>
      <div className="time-breakdown">
        <div className="time-bar">
          <div className="time-segment dev" style={{ width: `${devPct}%` }} />
          <div className="time-segment wait" style={{ width: `${waitPct}%` }} />
        </div>
        <div className="time-legend">
          <div className="time-legend-item">
            <span className="time-dot dev" />
            Active dev: {devPct}% ({formatDuration(session.totalActiveDevTimeMs)})
          </div>
          <div className="time-legend-item">
            <span className="time-dot wait" />
            Human wait: {waitPct}% ({formatDuration(session.totalHumanWaitTimeMs)})
          </div>
        </div>
      </div>
    </div>
  );
}

function RecentRuns({ runs }: { runs: RunMetrics[] }) {
  return (
    <div className="chart-card">
      <div className="chart-title">Recent Runs</div>
      <div className="runs-table">
        <div className="runs-header">
          <span>Ticket</span>
          <span>Status</span>
          <span>Interventions</span>
          <span>Duration</span>
          <span>Cost</span>
        </div>
        {runs.length === 0 && (
          <div className="runs-empty">No runs recorded yet</div>
        )}
        {runs.slice(0, 10).map((run) => (
          <div key={`${run.ticketId}-${run.startedAt}`} className="runs-row">
            <span className="runs-ticket">{run.ticketId.slice(0, 8)}</span>
            <span className={`runs-status ${run.status}`}>
              {run.status === 'completed' ? '\u2713' : run.status === 'failed' ? '\u2717' : '\u25CB'}
            </span>
            <span>{run.humanInterventionCount}</span>
            <span>{formatDuration(run.wallClockDurationMs)}</span>
            <span>${run.estimatedCostUsd.toFixed(2)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function AnalyticsView() {
  const [session, setSession] = useState<SessionMetrics | null>(null);
  const [trend, setTrend] = useState<TrendPoint[]>([]);
  const [runs, setRuns] = useState<RunMetrics[]>([]);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    const load = async () => {
      const [s, t] = await Promise.all([
        window.sweatshop.analytics.getSessionMetrics(),
        window.sweatshop.analytics.getTrend('interventions', { period: 'day', count: 7 }),
      ]);
      setSession(s);
      setTrend(t);

      // Load recent runs via runs API and then get metrics for each
      const allRuns = await window.sweatshop.runs.list();
      const runMetrics: RunMetrics[] = [];
      for (const r of allRuns.slice(0, 10)) {
        const m = await window.sweatshop.analytics.getRunMetrics(r.id);
        if (m) runMetrics.push(m);
      }
      setRuns(runMetrics);
    };
    load();
  }, []);

  const handleExport = async () => {
    setExporting(true);
    try {
      const json = await window.sweatshop.analytics.export();
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `sweatshop-analytics-${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  };

  if (!session) {
    return (
      <div className="analytics-view">
        <div className="analytics-loading">Loading analytics...</div>
      </div>
    );
  }

  const autonomyColor = session.autonomyScore >= 80 ? 'var(--success)' :
    session.autonomyScore >= 50 ? 'var(--warning)' : 'var(--error)';

  const approvalColor = session.firstPassApprovalRate >= 0.8 ? 'var(--success)' :
    session.firstPassApprovalRate >= 0.5 ? 'var(--warning)' : 'var(--error)';

  return (
    <div className="analytics-view">
      <div className="analytics-header">
        <h2>Analytics</h2>
        <div className="analytics-actions">
          <button className="btn-secondary" onClick={handleExport} disabled={exporting}>
            {exporting ? 'Exporting...' : 'Export JSON'}
          </button>
        </div>
      </div>

      <div className="analytics-body">
        <div className="metric-cards">
          <MetricCard
            label="Autonomy Score"
            value={`${session.autonomyScore}/100`}
            color={autonomyColor}
          />
          <MetricCard
            label="Velocity"
            value={`${session.velocity}/hr`}
            color="var(--accent)"
          />
          <MetricCard
            label="Cost per Ticket"
            value={`$${session.costPerTicketUsd.toFixed(2)}`}
            color="var(--text-primary)"
          />
          <MetricCard
            label="1st Pass Approval"
            value={`${Math.round(session.firstPassApprovalRate * 100)}%`}
            color={approvalColor}
          />
        </div>

        <div className="analytics-row">
          <BarChart data={trend} label="Interventions (Last 7 Days)" />
          <TimeBreakdown session={session} />
        </div>

        <div className="analytics-stats-row">
          <div className="stat-pill">
            <span className="stat-pill-label">Tickets</span>
            <span className="stat-pill-value">{session.completedTickets}/{session.totalTickets}</span>
          </div>
          <div className="stat-pill">
            <span className="stat-pill-label">Interventions</span>
            <span className="stat-pill-value">{session.totalInterventions}</span>
          </div>
          <div className="stat-pill">
            <span className="stat-pill-label">Reworks</span>
            <span className="stat-pill-value">{session.totalReworks}</span>
          </div>
          <div className="stat-pill">
            <span className="stat-pill-label">Total Cost</span>
            <span className="stat-pill-value">${session.totalCostUsd.toFixed(2)}</span>
          </div>
          <div className="stat-pill">
            <span className="stat-pill-label">Session Time</span>
            <span className="stat-pill-value">{formatDuration(session.totalSessionTimeMs)}</span>
          </div>
          <div className="stat-pill">
            <span className="stat-pill-label">Efficiency</span>
            <span className="stat-pill-value">{session.humanEfficiencyRatio}x</span>
          </div>
        </div>

        <RecentRuns runs={runs} />
      </div>
    </div>
  );
}
