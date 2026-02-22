# 15 — Ticket Return Flow (SweatShop → Cognito)

When SweatShop cannot complete a ticket — deploy failures, ambiguous requirements, missing access, scope creep, or repeated QA rejections — it must **return the ticket to Cognito** so a human can pick it up. This document defines the exact API calls, field values, and sequencing SweatShop must follow.

---

## Overview

The return flow updates three things on the Salesforce `Cognito__Ticket__c` record:

| Field | API Name | Value |
|-------|----------|-------|
| Agent Status | `Cognito__Agent_Status__c` | `Returned` or `Failed` |
| Agent Return Reason | `Cognito__Agent_Return_Reason__c` | Free-text explanation |
| Agent Enabled | `Cognito__Agent_Enabled__c` | `true` (keep enabled so the card shows the human icon) |

### Status Values

- **`Returned`** — The agent decided it cannot complete the work and is handing it back. Use this when the agent has done partial work or determined the task requires human judgment.
- **`Failed`** — The agent encountered an unrecoverable error (e.g. repeated deploy failures, org connectivity issues, token limit exceeded). Use this when the agent could not make meaningful progress.

Both statuses display identically in the UI (orange "Returned to human" badge, person silhouette icon on the card). The distinction is for analytics and triage.

---

## API Sequence

### Step 1: Update the final Agent Session

Before returning the ticket, close out the current `Agent_Session__c` record:

```
PATCH /services/data/v62.0/sobjects/Cognito__Agent_Session__c/<sessionId>
{
    "Cognito__Status__c": "Failed",
    "Cognito__Completed_At__c": "<ISO 8601 datetime>",
    "Cognito__Prompt_Tokens__c": <total_prompt_tokens>,
    "Cognito__Completion_Tokens__c": <total_completion_tokens>,
    "Cognito__Intervention_Count__c": <intervention_count>,
    "Cognito__Rework_Count__c": <rework_count>
}
```

Or use upsert with the external ID:

```
PATCH /services/data/v62.0/sobjects/Cognito__Agent_Session__c/Cognito__External_Run_Id__c/<run_uuid>
```

### Step 2: Insert a final Agent Event (optional but recommended)

Log why the agent is returning the ticket as an event:

```
POST /services/data/v62.0/sobjects/Cognito__Agent_Event__c
{
    "Cognito__Agent_Session__c": "<sessionId>",
    "Cognito__Event_Type__c": "Error Recovery",
    "Cognito__Agent_Message__c": "<detailed reason for returning>",
    "Cognito__Timestamp__c": "<ISO 8601 datetime>",
    "Cognito__Event_Order__c": <next_order_number>
}
```

### Step 3: Update the Ticket

This is the critical step that triggers the UI change in Cognito:

```
PATCH /services/data/v62.0/sobjects/Cognito__Ticket__c/<ticketId>
{
    "Cognito__Agent_Status__c": "Returned",
    "Cognito__Agent_Return_Reason__c": "<human-readable explanation>",
    "Cognito__Updated_Date__c": "<ISO 8601 datetime>"
}
```

**Important:** Do NOT set `Cognito__Agent_Enabled__c` to `false`. Leave it `true` so the ticket card shows the orange human-silhouette icon, indicating an agent worked on it but returned it.

---

## Return Reason Guidelines

The `Agent_Return_Reason__c` field is displayed directly in the Cognito ticket detail sidebar. Write clear, actionable reasons that help the human understand:

1. **What was attempted** — What did the agent try to do?
2. **What went wrong** — Why couldn't the agent complete it?
3. **What's left to do** — What does the human need to pick up?

### Good Examples

```
Attempted to implement the SOQL query for filtering tickets by label, but the
Cognito__Ticket_Label__c junction object requires a subquery that exceeds the
GraphQL adapter's nesting limit. A human needs to implement this as an Apex
controller method instead of inline GraphQL.
```

```
Deploy failed 3 times with FIELD_INTEGRITY_EXCEPTION on Cognito__Sprint__c.
The scratch org appears to have a validation rule blocking null End_Date__c
values. Need a human to check org configuration or update the validation rule.
```

```
Completed the component HTML and JS, but the acceptance criteria mention
"match the existing dashboard color scheme" — I cannot determine the exact
hex values from the requirements. Partial work is on branch feature/TKT-0042-workload.
```

### Bad Examples

```
Failed.
```

```
Could not complete the task.
```

```
Error occurred during deployment.
```

---

## Field Reference

### Cognito__Ticket__c — Agent Fields

| Field | API Name | Type | Notes |
|-------|----------|------|-------|
| Agent Enabled | `Cognito__Agent_Enabled__c` | Checkbox | `true` = ticket is/was agent-managed |
| Agent Status | `Cognito__Agent_Status__c` | Picklist | `Pending`, `Assigned`, `In Progress`, `QA Review`, `Completed`, `Failed`, `Returned` |
| Agent Return Reason | `Cognito__Agent_Return_Reason__c` | LongTextArea (32768) | Free-text; only populated when status is `Failed` or `Returned` |

### UI Behavior in Cognito

When `Agent_Status__c` is `Failed` or `Returned`:

- **Board card**: Orange person-silhouette icon replaces the droplet badge. Tooltip: "Returned to human"
- **Ticket detail header**: SweatShop button remains active (gradient) since `Agent_Enabled__c` is still `true`
- **Ticket detail sidebar**: Orange "Returned to human" badge under SweatShop field
- **Return reason**: Displayed below the SweatShop sidebar field with an orange left border accent. Only visible when status is `Failed`/`Returned` AND the field has content

### Re-sending to SweatShop

If a human clicks the SweatShop button to toggle agent off then on again, the following happens:
1. `Agent_Enabled__c` flips to `false` (clears the agent indicator)
2. User clicks again → `Agent_Enabled__c` flips to `true`
3. SweatShop picks up the ticket again as a new assignment
4. SweatShop should set `Agent_Status__c = 'Assigned'` and clear `Agent_Return_Reason__c` (set to empty string) on pickup

---

## Complete Lifecycle Example

```
1. Human sends ticket TKT-0042 to SweatShop
   → Cognito sets: Agent_Enabled__c = true

2. SweatShop picks up ticket
   → SweatShop sets: Agent_Status__c = 'Assigned'
   → SweatShop sets: Agent_Return_Reason__c = '' (clear any previous reason)
   → SweatShop creates Agent_Session__c (Status = 'Running')

3. SweatShop starts working
   → SweatShop sets: Agent_Status__c = 'In Progress'

4. Agent hits a blocker (deploy fails repeatedly)
   → SweatShop updates Agent_Session__c (Status = 'Failed', tokens, counts)
   → SweatShop inserts Agent_Event__c (Error Recovery event)
   → SweatShop sets: Agent_Status__c = 'Returned'
   → SweatShop sets: Agent_Return_Reason__c = 'Deploy failed 3x ...'

5. Human sees orange icon on board, opens ticket
   → Sees "Returned to human" badge
   → Reads return reason explaining what went wrong
   → Fixes the org issue, re-sends to SweatShop (or works it manually)
```

---

## Decision Tree: When to Return vs Retry

```
Can the agent retry and potentially succeed?
├── YES → Retry (up to configured max retries)
│         Log an Agent_Event (type: Error Recovery)
│         Keep Agent_Status = 'In Progress'
│
└── NO → Return to human
         ├── Is it an error/crash? → Agent_Status = 'Failed'
         └── Is it a judgment call? → Agent_Status = 'Returned'
             (ambiguous requirements, missing context, scope too large)
```

---

## Salesforce API Authentication

Use the same connected app credentials and OAuth flow documented in `14_cognito_agent_schema.md`. All PATCH/POST calls require:
- `Authorization: Bearer <access_token>`
- `Content-Type: application/json`
- API version: `v62.0` or later
