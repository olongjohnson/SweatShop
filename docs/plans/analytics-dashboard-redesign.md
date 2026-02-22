# Analytics Dashboard Redesign + Sprint Refresh Fix

## Context
The analytics view currently shows 7 chart tabs (one chart visible at a time), including the dependency graph. Two problems:
1. **Sprint refresh bug**: Switching sprints sometimes leaves charts showing stale data because wire handlers only update `_rawData` when `data` is truthy — null/empty results are silently ignored, keeping the old chart visible.
2. **Layout**: Single-chart tabs underutilize screen space. Dependency graph is project-scoped (not sprint-scoped) and deserves its own full-screen view.

## Changes

### 1. Fix sprint refresh bug (all 6 chart components)

**Root cause**: Every chart wire handler follows this pattern:
```javascript
if (data) {
    this._rawData = data;               // ← only updates on truthy data
    if (this._d3Loaded) this.renderChart();
} else if (error) {
    this.error = error;                  // ← _rawData keeps stale value
}
```

When switching to a sprint with no data (e.g., burndown for a Planned sprint), `_rawData` keeps the previous sprint's data, `hasData` stays true, and the old chart remains visible.

**Fix**: Always update `_rawData` on every wire fire:
```javascript
wiredXxx({ data, error }) {
    this.error = error || null;
    this._rawData = data || null;
    if (this._d3Loaded && this._rawData) this.renderChart();
}
```

**Files** (wire handler fix in each):
- `cognitoBurndown/cognitoBurndown.js`
- `cognitoCumulativeFlow/cognitoCumulativeFlow.js`
- `cognitoVelocity/cognitoVelocity.js`
- `cognitoPriorityBreakdown/cognitoPriorityBreakdown.js`
- `cognitoWorkload/cognitoWorkload.js`
- `cognitoDependencyGraph/cognitoDependencyGraph.js`

### 2. Promote dependency graph to its own nav view

**cognitoNav.html** — Add "Dependencies" button to the view toggle group:
```html
<button class={dependenciesButtonClass} onclick={handleViewChange} data-view="dependencies">
    <lightning-icon icon-name="utility:connected_apps" size="x-small"></lightning-icon>
    Dependencies
</button>
```

**cognitoNav.js** — Add getter:
```javascript
get dependenciesButtonClass() {
    return this.currentView === 'dependencies' ? 'view-btn active' : 'view-btn';
}
```

**cognitoProjectApp.html** — Add new view block:
```html
<template lwc:if={showDependenciesView}>
    <c-cognito-dependency-graph
        project-id={selectedProjectId}
        onticketclick={handleTicketClick}>
    </c-cognito-dependency-graph>
</template>
```

**cognitoProjectApp.js** — Add getter:
```javascript
get showDependenciesView() {
    return this.currentView === 'dependencies';
}
```

**cognitoDependencyGraph.css** — Ensure full-height fill:
```css
:host { display: block; height: 100%; width: 100%; }
.graph-container { width: 100%; height: 100%; }
```

### 3. Convert analytics from tabs to dashboard grid

**cognitoAnalytics.html** — Replace tab navigation with scrollable dashboard grid:
```
┌────────────────────────────────────────────┐
│  Sprint Report KPIs (full width)           │
├─────────────────────┬──────────────────────┤
│  Burndown Chart     │  Velocity Chart      │
│                     │                      │
├─────────────────────┼──────────────────────┤
│  Priority Donut     │  Team Workload       │
│                     │                      │
├─────────────────────┴──────────────────────┤
│  Cumulative Flow (full width)              │
│                                            │
└────────────────────────────────────────────┘
```

- Remove tab bar and `activeChart` state + all `showXxx` getters
- Render ALL charts simultaneously in a CSS grid
- Sprint report at top (full width)
- 2×2 grid: burndown + velocity, priority + workload
- Cumulative flow full-width at bottom
- Scrollable container (overflow-y: auto) since content exceeds viewport

**cognitoAnalytics.js** — Remove:
- `activeChart` property
- `chartTabs` getter
- All `showReport/showBurndown/showVelocity/showFlow/showPriority/showWorkload/showDependencies` getters
- `handleTabClick()` method
- Dependency graph reference

**cognitoAnalytics.css** — Replace tab styles with grid layout:
```css
.analytics-dashboard {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1rem;
    padding: 1rem;
    overflow-y: auto;
    height: 100%;
}
.analytics-dashboard .report-section { grid-column: 1 / -1; }
.analytics-dashboard .flow-section { grid-column: 1 / -1; }
.chart-card {
    background: var(--cognito-surface);
    border: 1px solid var(--cognito-border);
    border-radius: 0.5rem;
    padding: 1rem;
    min-height: 320px;
}
```

## Files to Modify

| File | Change |
|------|--------|
| `cognitoBurndown/cognitoBurndown.js` | Fix wire handler |
| `cognitoCumulativeFlow/cognitoCumulativeFlow.js` | Fix wire handler |
| `cognitoVelocity/cognitoVelocity.js` | Fix wire handler |
| `cognitoPriorityBreakdown/cognitoPriorityBreakdown.js` | Fix wire handler |
| `cognitoWorkload/cognitoWorkload.js` | Fix wire handler |
| `cognitoDependencyGraph/cognitoDependencyGraph.js` | Fix wire handler |
| `cognitoDependencyGraph/cognitoDependencyGraph.css` | Full-height styling |
| `cognitoAnalytics/cognitoAnalytics.js` | Remove tabs, remove dep graph, render all charts |
| `cognitoAnalytics/cognitoAnalytics.html` | Dashboard grid layout |
| `cognitoAnalytics/cognitoAnalytics.css` | Grid styles replacing tab styles |
| `cognitoNav/cognitoNav.js` | Add dependenciesButtonClass getter |
| `cognitoNav/cognitoNav.html` | Add Dependencies view button |
| `cognitoProjectApp/cognitoProjectApp.js` | Add showDependenciesView getter |
| `cognitoProjectApp/cognitoProjectApp.html` | Add dependencies view block |

## Verification
1. Switch sprints rapidly on the analytics dashboard — all charts should update every time
2. Switch to a Planned sprint (no history data) — burndown/CFD should show empty state, not stale data
3. Navigate to Dependencies view — graph fills full available space
4. Analytics dashboard shows all 6 charts simultaneously in grid layout
5. Dashboard scrolls when content exceeds viewport height
6. Deploy with `sf project deploy start`
