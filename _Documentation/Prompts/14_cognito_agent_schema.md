# SweatShop Agent Schema — Salesforce Write-Back Reference

This document describes the Salesforce objects, fields, and API endpoints that SweatShop uses to track agent performance against Cognito tickets. SweatShop writes data here; Cognito reads it for dashboards and ticket detail views.

---

## Objects Overview

```
Cognito__Project__c
  └─ Cognito__Ticket__c          (MasterDetail, level 1)
       ├─ Agent_Enabled__c       (checkbox — flags ticket for SweatShop)
       ├─ Agent_Status__c        (picklist — agent lifecycle state)
       └─ Cognito__Agent_Session__c   (MasterDetail, level 2)
            ├─ External_Run_Id__c     (external ID — SweatShop's UUID for upsert)
            └─ Cognito__Agent_Event__c (Lookup — NOT MasterDetail, nesting limit)
```

**Why Lookup on Events?** Salesforce limits MasterDetail nesting to 2 levels. Project→Ticket→Session already hits the cap, so Events use a Lookup to Session with `deleteConstraint: SetNull`.

---

## 1. Ticket Fields (on `Cognito__Ticket__c`)

| Field API Name | Type | Values | Default | Purpose |
|---|---|---|---|---|
| `Cognito__Agent_Enabled__c` | Checkbox | true/false | false | Set `true` to flag ticket for SweatShop pickup |
| `Cognito__Agent_Status__c` | Picklist (restricted) | Pending, Assigned, In Progress, QA Review, Completed, Failed, Returned | — | Agent lifecycle state |

### Status Lifecycle

```
User clicks "Send to SweatShop"
  → Agent_Enabled__c = true  (Cognito UI does this)

SweatShop picks it up:
  Pending → Assigned → In Progress → QA Review → Completed
                ↓              ↓                    ↓
              Failed         Failed              Returned
```

- **Pending** — Flagged by user, not yet claimed
- **Assigned** — SweatShop has claimed it
- **In Progress** — Agent is actively working
- **QA Review** — Agent done, awaiting human QA
- **Completed** — Human approved the work
- **Failed** — Unrecoverable error or max retries
- **Returned** — Sent back for human resolution

---

## 2. Agent Session (`Cognito__Agent_Session__c`)

One session = one agent run against a ticket. A ticket can have multiple sessions (pipeline stages, retries).

**Object config:** AutoNumber `AGS-{0000}`, ControlledByParent sharing, MasterDetail to Ticket.

### Writable Fields

| Field API Name | Type | Size | Required | Notes |
|---|---|---|---|---|
| `Cognito__Ticket__c` | MasterDetail | — | YES | Parent ticket ID |
| `Cognito__External_Run_Id__c` | Text | 255 | NO | **External ID, Unique.** SweatShop's UUID. Use for upsert to prevent duplicates. |
| `Cognito__Status__c` | Picklist | — | **YES** | `Running`, `Completed`, `Failed`, `Cancelled` |
| `Cognito__Agent_Name__c` | Text | 255 | NO | Identity name (e.g. "Forge", "Anvil") |
| `Cognito__Agent_Model__c` | Text | 50 | NO | Model ID (e.g. `claude-sonnet-4-6`) |
| `Cognito__Camp_Alias__c` | Text | 100 | NO | Scratch org alias |
| `Cognito__Branch_Name__c` | Text | 255 | NO | Git feature branch |
| `Cognito__Started_At__c` | DateTime | — | NO | ISO 8601 run start |
| `Cognito__Completed_At__c` | DateTime | — | NO | ISO 8601 run end (null while running) |
| `Cognito__Intervention_Count__c` | Number | 5,0 | NO | Human interventions (default 0) |
| `Cognito__Rework_Count__c` | Number | 5,0 | NO | QA rejections (default 0) |
| `Cognito__Prompt_Tokens__c` | Number | 12,0 | NO | Input tokens (default 0) |
| `Cognito__Completion_Tokens__c` | Number | 12,0 | NO | Output tokens (default 0) |
| `Cognito__Session_Order__c` | Number | 5,0 | NO | Pipeline sequence, 0-indexed (default 0) |

### Formula Fields (READ-ONLY — do NOT write)

| Field API Name | Type | Formula |
|---|---|---|
| `Cognito__Duration_Minutes__c` | Number(18,2) | `(Completed_At - Started_At) * 24 * 60` |
| `Cognito__Estimated_Cost__c` | Currency(18,4) | `Prompt_Tokens * 0.000015 + Completion_Tokens * 0.000075` |
| `Cognito__Autonomy_Score__c` | Number(5,0) | `MAX(0, 100 - Intervention_Count * 15)` |

---

## 3. Agent Event (`Cognito__Agent_Event__c`)

One event = one human intervention or agent question during a session.

**Object config:** AutoNumber `AGE-{0000}`, ReadWrite sharing, Lookup to Session (SetNull on delete).

### Fields

| Field API Name | Type | Size | Required | Notes |
|---|---|---|---|---|
| `Cognito__Agent_Session__c` | Lookup | — | NO | Parent session ID |
| `Cognito__Event_Type__c` | Picklist | — | NO | `Question`, `Rework`, `Guidance`, `Error Recovery` |
| `Cognito__Agent_Message__c` | LongTextArea | 32768 | NO | What the agent asked/reported |
| `Cognito__Human_Response__c` | LongTextArea | 32768 | NO | What the human typed back |
| `Cognito__Wait_Duration_Ms__c` | Number | 12,0 | NO | Milliseconds agent was blocked (default 0) |
| `Cognito__Timestamp__c` | DateTime | — | NO | When event occurred (ISO 8601) |
| `Cognito__Event_Order__c` | Number | 5,0 | NO | Sequence within session, 0-indexed (default 0) |

### Event Type Mapping

| SweatShop Internal | Salesforce Value |
|---|---|
| `question` / `needs_input` | `Question` |
| `rework` / `qa_rejection` | `Rework` |
| `guidance` / `human_feedback` | `Guidance` |
| `error_recovery` / `deploy_failure` | `Error Recovery` |

---

## 4. Write-Back Sequence

### Step 1: Update ticket status

When SweatShop claims a ticket:

```
UPDATE Cognito__Ticket__c
SET Cognito__Agent_Status__c = 'Assigned'
WHERE Id = '<ticketId>'
```

Note: `Agent_Enabled__c` is already `true` — the Cognito UI sets it when the user clicks "Send to SweatShop".

### Step 2: Upsert session on run start

```bash
sf data upsert record \
  --sobject Cognito__Agent_Session__c \
  --external-id Cognito__External_Run_Id__c \
  --values "Cognito__External_Run_Id__c='<uuid>' \
    Cognito__Ticket__c='<ticketId>' \
    Cognito__Status__c='Running' \
    Cognito__Agent_Name__c='Forge' \
    Cognito__Agent_Model__c='claude-sonnet-4-6' \
    Cognito__Camp_Alias__c='CognitoDev' \
    Cognito__Branch_Name__c='feature/ticket-123' \
    Cognito__Started_At__c='2025-01-15T14:30:00Z' \
    Cognito__Session_Order__c=0"
```

Always use `External_Run_Id__c` for upsert. If a write-back retries, it updates rather than duplicates.

### Step 3: Insert events during execution

```bash
sf data create record \
  --sobject Cognito__Agent_Event__c \
  --values "Cognito__Agent_Session__c='<sessionId>' \
    Cognito__Event_Type__c='Question' \
    Cognito__Agent_Message__c='Should I use MasterDetail or Lookup?' \
    Cognito__Human_Response__c='Use MasterDetail.' \
    Cognito__Wait_Duration_Ms__c=45000 \
    Cognito__Timestamp__c='2025-01-15T14:32:00Z' \
    Cognito__Event_Order__c=0"
```

### Step 4: Upsert session on completion

```bash
sf data upsert record \
  --sobject Cognito__Agent_Session__c \
  --external-id Cognito__External_Run_Id__c \
  --values "Cognito__External_Run_Id__c='<uuid>' \
    Cognito__Status__c='Completed' \
    Cognito__Completed_At__c='2025-01-15T15:12:00Z' \
    Cognito__Intervention_Count__c=2 \
    Cognito__Rework_Count__c=0 \
    Cognito__Prompt_Tokens__c=85000 \
    Cognito__Completion_Tokens__c=28000"
```

### Step 5: Update ticket final status

```
UPDATE Cognito__Ticket__c
SET Cognito__Agent_Status__c = 'Completed'
WHERE Id = '<ticketId>'
```

Use `Failed` or `Returned` instead if the agent couldn't complete.

---

## 5. Apex API (for LWC consumption, not SweatShop)

Controller: `AgentMetricsController` — `public with sharing`, all methods `@AuraEnabled(cacheable=true)`.

| Method | Returns | Purpose |
|---|---|---|
| `getTicketAgentTimeline(Id ticketId)` | `TicketTimelineData` | All sessions + events for one ticket, plus rollup stats |
| `getProjectAgentSummary(Id projectId)` | `ProjectAgentSummary` | Project-wide totals: sessions, cost, autonomy, model breakdown |
| `getAgentIdentityStats(Id projectId)` | `List<AgentIdentityStats>` | Per-agent-name stats: success rate, avg autonomy, cost |
| `getTicketTypeResolution(Id projectId)` | `TicketResolutionData` | Success rate by ticket type and priority |
| `getWorkflowMetrics(Id projectId)` | `WorkflowData` | Pipeline metrics: avg sessions/ticket, human wait time, failure by stage |

These are read-only endpoints for the Cognito UI. SweatShop doesn't call them.

---

## 6. Rules & Constraints

1. **Upsert on External_Run_Id__c** — Always. Never insert sessions without using the external ID.

2. **Formula fields are read-only** — Don't write to `Duration_Minutes__c`, `Estimated_Cost__c`, or `Autonomy_Score__c`. Salesforce computes them.

3. **MasterDetail cascade** — Deleting a ticket deletes all its sessions. Events use Lookup (SetNull), so they survive session deletion as orphans.

4. **Timestamps** — ISO 8601 format: `2025-01-15T14:30:00Z`

5. **Ordering** — Sessions ordered by `Session_Order__c` (0-indexed). Events ordered by `Event_Order__c` (0-indexed).

6. **Status is required** — `Agent_Session__c.Status__c` must be one of: Running, Completed, Failed, Cancelled.

7. **Permission set** — Connecting user needs `Cognito_Admin` permission set (full CRUD + modifyAll on both objects).

8. **Autonomy scoring** — Each human intervention costs 15 points: `MAX(0, 100 - interventions * 15)`. A session with 0 interventions scores 100. A session with 7+ interventions scores 0.

---

## 7. UI Integration Points

**Board cards** — Tickets with `Agent_Enabled__c = true` show a gradient droplet badge (Warp Red #F50046 → Parsec Blue #23AAFF) and a red left border.

**Ticket detail header** — "SweatShop" toggle button with the same gradient when active. Flips `Agent_Enabled__c`.

**Ticket detail sidebar** — Shows "Queued" or "Not queued" as read-only status.

**Ticket detail "Agent" tab** — `c-cognito-agent-timeline` component showing session pipeline blocks with expandable event lists. Wired to `getTicketAgentTimeline`.

**Analytics dashboard** — `c-cognito-agent-metrics` card showing project-level agent stats. Wired to `getProjectAgentSummary`.
