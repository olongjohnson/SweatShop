# Kanban Board — Implementation Plan

## Context
Build a local-only kanban board for personal game development project management. The user is a Salesforce developer with limited modern web dev experience, so the stack prioritizes simplicity and ease of use. No cloud services, no backend — everything runs locally with browser localStorage. No AI features yet — just a solid, functional kanban board.

---

## Technology Stack

| Layer | Choice | Why |
|---|---|---|
| Build Tool | **Vite** (`react-ts` template) | Single command scaffold, instant dev server |
| Framework | **React 19 + TypeScript** | Industry standard, strong type safety |
| Styling | **Tailwind CSS v4** (`@tailwindcss/vite` plugin) | Utility classes, no CSS files to maintain |
| UI Components | **shadcn/ui** (new-york style) | Components copied into your source — you own the code |
| State + Storage | **Zustand** with `persist` middleware | Minimal boilerplate, auto-persists to localStorage |
| Drag & Drop | **@hello-pangea/dnd** | Purpose-built for kanban, smooth animations out of the box |
| Icons | **lucide-react** | Already a shadcn dependency |
| IDs | **nanoid** | Short, URL-safe unique IDs |

**Deliberately excluded**: No router (view switching via state), no data fetching lib, no testing framework in initial build, no ESLint/Prettier beyond Vite defaults.

---

## Data Model

### Ticket Types
- **Epic** → top-level container (e.g., "Core Gameplay Loop")
- **Feature** → child of an Epic (e.g., "Player Movement System")
- **Task** → child of a Feature or Epic (e.g., "Implement jump mechanic")

### Statuses
Backlog → To Do → In Progress → In Review → Done → Archived

### Ticket Fields
`id`, `type`, `title`, `description`, `acceptanceCriteria`, `status`, `priority` (critical/high/medium/low), `storyPoints`, `assigneeId`, `parentId`, `labels[]`, `order`, `createdAt`, `updatedAt`

### Supporting Entities
- **Assignee**: `id`, `name`, `avatar` (initials), `color`
- **Label**: `id`, `name`, `color` — pre-seeded with game dev defaults (Physics, UI, Audio, Rendering, AI, Input, Animation, Level Design, etc.)

### Storage
Three separate Zustand stores persisted to localStorage:
- `kanban-tickets` — ticket data + column ordering
- `kanban-assignees` — assignee list
- `kanban-ui` — persisted UI prefs (active view, sidebar state); filters reset on page load

---

## Project Structure

```
kanban-board/
├── src/
│   ├── main.tsx, App.tsx, index.css
│   ├── types/index.ts                    # All interfaces
│   ├── store/
│   │   ├── ticket-store.ts               # Tickets CRUD + DnD ordering
│   │   ├── assignee-store.ts             # Assignee management
│   │   └── ui-store.ts                   # View state, filters, sidebar
│   ├── lib/
│   │   ├── utils.ts                      # cn() + helpers
│   │   └── constants.ts                  # Statuses, priorities, defaults
│   ├── hooks/
│   │   ├── use-filtered-tickets.ts       # Filtered/sorted ticket lists
│   │   └── use-kanban-dnd.ts             # DnD event handler
│   ├── data/seed.ts                      # Demo data for first run
│   └── components/
│       ├── ui/                           # shadcn primitives (auto-generated)
│       ├── layout/Header.tsx, Sidebar.tsx
│       ├── kanban/KanbanBoard.tsx, KanbanColumn.tsx, KanbanCard.tsx
│       ├── list/ListView.tsx, ListRow.tsx
│       ├── ticket/TicketDetailView.tsx, TicketForm.tsx, TicketHierarchy.tsx, TicketCreateDialog.tsx
│       ├── settings/AssigneeManager.tsx, LabelManager.tsx
│       └── shared/PriorityBadge.tsx, TypeBadge.tsx, StatusBadge.tsx, LabelBadge.tsx, EmptyState.tsx
```

---

## Implementation Order

### Phase 1: Foundation
1. Scaffold project (Vite + React + TS + Tailwind + shadcn)
2. Create types, constants, utility functions
3. Build Zustand stores with localStorage persistence
4. Build kanban board with drag-and-drop
5. Basic ticket cards (title, type badge, priority, assignee)

### Phase 2: Views & Filtering
6. Ticket detail view (full-screen, all fields editable)
7. List view with sortable columns
8. Filter sidebar (search, type, status, priority, assignee, label)
9. Assignee management
10. Label management

### Phase 3: Hierarchy & Polish
11. Parent-child relationships
12. Ticket hierarchy display (children count on cards, child list in detail)
13. Story point totals per column
14. Quick-add button per column
15. Keyboard shortcuts (N = new ticket, Esc = close dialog)
16. Dark mode toggle
17. Seed demo data for first run

---

## Game Dev Specific Features
- Pre-seeded labels: Physics, UI, Audio, Rendering, Networking, AI, Input, Animation, Level Design, Tools
- Hierarchy model maps well to game dev: Epic = "Combat System", Feature = "Melee Attacks", Task = "Implement sword swing animation"
- Story points for sprint-style planning
- Lightweight — no bloat, fast local iteration

---

## Setup Commands
```bash
npm create vite@latest kanban-board -- --template react-ts
cd kanban-board
npm install zustand @hello-pangea/dnd nanoid lucide-react
npm install tailwindcss @tailwindcss/vite
npm install -D tw-animate-css @types/node
# Configure vite.config.ts, tsconfig, shadcn init, add shadcn components
npx shadcn@latest init
npx shadcn@latest add button badge card dialog input textarea select sheet dropdown-menu separator scroll-area tabs tooltip label
npm run dev  # → http://localhost:5173
```

---

## Verification
1. Run `npm run dev` — app loads at localhost:5173
2. Create tickets of all types (Epic, Feature, Task)
3. Drag tickets between columns — verify status updates
4. Switch to list view — verify sorting and filtering
5. Open ticket detail — verify all fields editable
6. Refresh browser — verify all data persists
7. Manage assignees and labels in sidebar
8. Assign parent relationships and verify hierarchy display
