# SweatShop — Diagrams

## 1. Current Workflow (Pre-SweatShop)

```mermaid
flowchart TD
    A[Human defines ticket in Cognito] --> B[Human manually writes prompt]
    B --> C[Human pastes prompt into AI agent]
    C --> D[Agent develops solution]
    D --> E{Agent needs input?}
    E -->|Yes| F[Human answers question]
    F --> D
    E -->|No| G[Human creates feature branch]
    G --> H[Human deploys to scratch org]
    H --> I[Human manually provisions org]
    I --> J[Human performs QA in browser]
    J --> K{Passes QA?}
    K -->|No| L[Human writes feedback prompt]
    L --> D
    K -->|Yes| M[Human merges branch]
    M --> N{More tickets?}
    N -->|Yes| A
    N -->|No| O[Done]

    style A fill:#4a90d9,color:#fff
    style D fill:#f5a623,color:#fff
    style J fill:#7ed321,color:#fff
    style O fill:#9013fe,color:#fff
```

## 2. SweatShop End-to-End Flow

```mermaid
flowchart TD
    A[Tickets defined in Cognito] --> B[SweatShop pulls tickets]
    B --> C[Orchestrator refines tickets into prompts]
    C --> D[Orchestrator analyzes dependencies]
    D --> E[Orchestrator dispatches to agents]

    E --> F1[Agent 1]
    E --> F2[Agent 2]
    E --> FN[Agent N]

    F1 --> G1[Create branch]
    F2 --> G2[Create branch]
    FN --> GN[Create branch]

    G1 --> H1[Develop]
    G2 --> H2[Develop]
    GN --> HN[Develop]

    H1 --> I1[Provision scratch org]
    H2 --> I2[Provision scratch org]
    HN --> IN[Provision scratch org]

    I1 --> J1[QA_READY — notify human]
    I2 --> J2[QA_READY — notify human]
    IN --> JN[QA_READY — notify human]

    J1 --> K[Human reviews in dashboard]
    J2 --> K
    JN --> K

    K --> L{Approved?}
    L -->|Yes| M[Merge branch]
    L -->|No| N[Feedback → agent reworks]
    N --> H1
    N --> H2
    N --> HN

    M --> O{More tickets?}
    O -->|Yes| E
    O -->|No| P[All work complete]

    style A fill:#4a90d9,color:#fff
    style C fill:#f5a623,color:#fff
    style K fill:#7ed321,color:#fff
    style P fill:#9013fe,color:#fff
```

## 3. Agent Lifecycle State Machine

```mermaid
stateDiagram-v2
    [*] --> IDLE

    IDLE --> ASSIGNED : Orchestrator dispatches ticket
    ASSIGNED --> BRANCHING : Agent begins work
    BRANCHING --> DEVELOPING : Branch created
    DEVELOPING --> PROVISIONING : Development complete
    DEVELOPING --> NEEDS_INPUT : Agent has question
    NEEDS_INPUT --> DEVELOPING : Human responds
    PROVISIONING --> QA_READY : Org provisioned
    PROVISIONING --> ERROR : Provisioning fails
    ERROR --> PROVISIONING : Retry
    QA_READY --> MERGING : Human approves
    QA_READY --> REWORK : Human rejects
    REWORK --> DEVELOPING : Agent addresses feedback
    MERGING --> IDLE : Branch merged
    MERGING --> ERROR : Merge conflict

    note right of QA_READY
        Dashboard notifies human
        Browser loads scratch org
    end note

    note right of NEEDS_INPUT
        Dashboard notifies human
        Chat pane surfaces question
    end note
```

## 4. Org Access Controller Flow

```mermaid
flowchart TD
    A[Agent needs a scratch org] --> B{Org pool has availability?}
    B -->|No| C[Block — notify orchestrator]
    C --> D[Wait for org release]
    D --> B

    B -->|Yes| E[Claim org from pool]
    E --> F[Register agent → org mapping]
    F --> G[Agent deploys to assigned org]

    G --> H{Agent work complete?}
    H -->|QA approved| I[Release org back to pool]
    H -->|Rework needed| G

    I --> J[Clear agent → org mapping]
    J --> K[Org available for next agent]

    style C fill:#d0021b,color:#fff
    style E fill:#7ed321,color:#fff
    style I fill:#4a90d9,color:#fff
```

## 5. Scratch Org Provisioning Script

```mermaid
flowchart TD
    A[Provisioning triggered] --> B[Create scratch org / claim from pool]
    B --> C[Push source from feature branch]
    C --> D{Deploy success?}
    D -->|No| E[Log errors — agent enters ERROR]
    D -->|Yes| F[Load test data - seed records]
    F --> G[Create users]
    G --> H[Assign permission sets]
    H --> I[Generate login URL - frontdoor]
    I --> J[Report QA_READY to orchestrator]
    J --> K[Dashboard loads org in browser pane]

    style A fill:#4a90d9,color:#fff
    style E fill:#d0021b,color:#fff
    style K fill:#7ed321,color:#fff
```

## 6. Orchestrator Dispatch Logic

```mermaid
flowchart TD
    A[Receive ticket batch from Cognito] --> B[Parse dependencies]
    B --> C[Build dependency graph]
    C --> D[Identify independent ticket groups]

    D --> E{Available agents?}
    E -->|No| F[Wait for agent to become IDLE]
    F --> E
    E -->|Yes| G[Select next ticket group]

    G --> H[Refine ticket into prompt]
    H --> I[Inject codebase context and conventions]
    I --> J[Check for file overlap with active agents]

    J --> K{Overlap detected?}
    K -->|Yes| L[Queue ticket — serialize after conflicting agent]
    K -->|No| M[Assign to available agent]

    M --> N[Request org from Org Access Controller]
    N --> O[Dispatch prompt + org to agent]

    L --> E

    style A fill:#4a90d9,color:#fff
    style H fill:#f5a623,color:#fff
    style O fill:#7ed321,color:#fff
    style L fill:#d0021b,color:#fff
```

## 7. Dashboard UI Component Layout

```mermaid
flowchart LR
    subgraph TabBar["Agent Tab Bar"]
        T1["Agent 1"]
        T2["Agent 2 ●"]
        T3["Agent 3"]
        TP["[+]"]
    end

    subgraph LeftSidebar["Left Sidebar ~30%"]
        subgraph Chat["Chat Pane"]
            CM["Message history"]
            CI["Input + Send"]
            CA["[Approve] [Reject]"]
        end
        subgraph Terminal["Terminal Pane"]
            TO["Live command output"]
        end
    end

    subgraph Main["Browser Pane ~70%"]
        BN["Navigation: ← → ↻ URL"]
        BW["Scratch Org Webview"]
    end

    TabBar --> LeftSidebar
    TabBar --> Main
```

## 8. Git Branching Strategy

```mermaid
gitgraph
    commit id: "main"
    branch feature/TICKET-001-login-page
    commit id: "Agent 1: implement login"
    commit id: "Agent 1: add tests"
    checkout main
    branch feature/TICKET-002-dashboard
    commit id: "Agent 2: build dashboard"
    commit id: "Agent 2: add charts"
    checkout main
    branch feature/TICKET-003-api-endpoints
    commit id: "Agent 3: create endpoints"
    checkout main
    merge feature/TICKET-001-login-page id: "QA approved"
    merge feature/TICKET-002-dashboard id: "QA approved"
    merge feature/TICKET-003-api-endpoints id: "QA approved"
```
