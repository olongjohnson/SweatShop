# SweatShop — Project Overview

## Vision

SweatShop is an AI agent orchestrator purpose-built for Salesforce development. It bridges the gap between project management (ticket definition) and autonomous code delivery by converting refined tickets into agent-ready prompts, dispatching work to parallel AI agents, and surfacing completed work for human QA — all within a single unified interface.

## The Problem

Today's AI-assisted Salesforce development is serial and manual:

1. A human defines scope in a project management tool.
2. A human translates that scope into prompts for a single AI agent.
3. The human babysits the agent through development, testing, and deployment.
4. Repeat — one ticket at a time.

The human isn't writing code — they're *managing* an agent. That management layer is the bottleneck, and it doesn't scale.

## The Solution

SweatShop automates the management layer:

| Manual today | SweatShop |
|---|---|
| Copy ticket details into a prompt | Tickets auto-refined into agent prompts |
| Run one agent at a time | Multiple agents work in parallel |
| Manually create branches | Agents create their own feature branches |
| Manually set up scratch orgs for QA | Automated org provisioning (deploy, data, users, permsets) |
| Alt-tab between tools to monitor | Unified multi-agent dashboard |
| No guardrails on org access | Strict agent-to-org access controls |

## Core Concepts

### Ticket → Prompt Pipeline
SweatShop integrates with Cognito (our Salesforce-native project management tool) to pull tickets. It refines ticket descriptions, acceptance criteria, and context into structured prompts that agents can execute against.

### The Orchestrator
The central brain that decides how to decompose work. Given a set of tickets, it determines:
- Which tickets can be parallelized
- Which require sequential execution (dependencies)
- How to distribute work across available agents
- Which scratch org each agent targets

### Agents
Each agent is an autonomous AI development session. An agent:
- Receives a refined prompt from the orchestrator
- Creates a feature branch
- Performs development (code, metadata, config)
- Runs a provisioning script to stand up a QA-ready scratch org
- Signals the human when ready for review

### The Dashboard
A multi-pane UI that gives the human visibility into all active agents:
- **Chat pane** — interact with the agent, provide input, answer questions
- **Terminal pane** — live output of commands, deployments, test runs
- **Browser pane** (primary) — the scratch org, for QA review
- Agent-switching with clear "ready for input" indicators

### Org Access Controls
Strict mapping of which agents can write to which scratch orgs. In development, org count is limited — agents must be explicitly assigned. In production environments this constraint relaxes, but the control mechanism remains.

## Integration Points

| System | Role |
|---|---|
| **Cognito** (Salesforce) | Source of tickets and project scope |
| **Salesforce CLI (`sf`)** | Org creation, metadata deployment, data loading |
| **Git** | Branch management, merge operations |
| **AI Provider** (Claude / etc.) | Agent intelligence |
| **Browser** | QA surface for human reviewers |

## Success Criteria

1. A human can define work in Cognito, press go, and have multiple agents execute in parallel.
2. Each completed ticket results in a QA-ready scratch org the human can immediately evaluate.
3. Approved work merges cleanly back to the target branch.
4. The human never loses visibility — every agent's state is observable at a glance.
5. No agent can accidentally write to the wrong org.
