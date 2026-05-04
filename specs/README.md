# Personal Hub — Specification

A personal productivity hub built on top of the `nuxt-drizzle` starter. Combines a Knowledge Base, Todos, GitHub Project tracking, and an AI Orchestrator that can read and write across all of them via Self-MCP.

## Documents in this Spec

| File | Purpose |
|------|---------|
| `README.md` | Overview, build order, glossary (this file) |
| `requirements.md` | What we're building — user stories and acceptance criteria |
| `design.md` | How we're building it — architecture, data model, API and tool contracts |
| `tasks.md` | Atomic, ordered, checkable tasks for implementation |
| `decisions.md` | Architecture Decision Records (ADRs) — why things are the way they are |

## How to Use This Spec (for AI agents)

1. **Always start with `README.md`** to understand scope and current phase.
2. When picking up a task from `tasks.md`, load the referenced sections of `requirements.md` and `design.md` into context — not the whole files unless needed.
3. Before making a structural decision, check `decisions.md`. If a decision conflicts with what you're about to do, stop and ask the user.
4. After completing a task, mark it done in `tasks.md` and note any deviations or follow-ups.
5. If a new architectural decision is made during implementation, add an ADR to `decisions.md`.

## Build Order (Phases)

The build is split into four phases. Each phase produces a usable product slice — don't start the next phase until the previous one works end-to-end.

### Phase 1 — Foundation: Workspaces + Knowledge Base
- Map "Workspaces" onto the existing `organisation` concept
- KB entries with Markdown, tags, categories, wikilinks, full-text search
- Inbox / draft / verified / archived status flow
- **Outcome:** A working personal wiki, scoped per workspace.

### Phase 2 — Todos
- Todos with subtasks (self-referential), priority, due date, optional Markdown notes
- Linking todos to KB entries
- **Outcome:** A working task manager that integrates with the KB.

### Phase 3 — Orchestrator (Self-MCP)
- AI provider abstraction via Vercel AI SDK; providers, models, and credentials configurable in DB and admin UI
- MCP server exposing read and write tools for KB and Todos
- Chat UI with per-conversation model picker
- Read-only vs. write modes per chat session
- Confirmation pattern for destructive/write actions
- Audit log for all write actions, with model attribution
- **Outcome:** AI assistant that knows your hub and can act on it with your approval — vendor-agnostic.

### Phase 4 — GitHub Integration (read-only)
- OAuth or PAT-based connection to GitHub
- Periodic polling cache for repos, issues, PRs, commit metadata
- Deep-links to `github.dev` for quick code editing
- Orchestrator tools for reading the cached GitHub data
- **Outcome:** Repos, issues and commits visible inside the hub and queryable by the orchestrator.

## Glossary

| Term | Meaning |
|------|---------|
| **Workspace** | UI-level term for an organisation. The user picks a workspace; data is scoped by `organisation_id` underneath. |
| **KB Entry** | A single Markdown document in the Knowledge Base. Has metadata: tags, category, status, author, source. |
| **Wikilink** | An `[[entry-slug]]` reference inside a KB entry. Parsed and materialised in an `entry_links` table. |
| **Status (KB)** | One of `inbox`, `draft`, `verified`, `archived`. Filters search and orchestrator visibility by default. |
| **Author** | Composite of `author_type` (`human` / `ai`) and `author_name` (free-form). Stored on KB entries. |
| **Source** | Composite of `source_type` (`manual` / `commit` / `claude_code_session` / `chat` / `external`) and `source_ref`. Tracks where AI-generated content came from. |
| **Orchestrator** | The AI chat feature backed by an MCP server that exposes the hub's data and write actions. |
| **Self-MCP** | The MCP server we build that wraps our own internal API for the Orchestrator's consumption. |
| **Confirmation Pattern** | Two-step write flow: orchestrator proposes a structured action; user confirms via UI before it executes. |
| **Audit Log** | `orchestrator_actions` table recording every write action with tool, params, timestamp, result. |
| **AI Provider** | A vendor reachable via the Vercel AI SDK (Anthropic, OpenAI, Google, …). Stored in `ai_providers`. |
| **AI Model** | A specific selectable model from a provider, e.g. `claude-sonnet-4-5`. Stored in `ai_models` with capability flags. |
| **Provider Credentials** | Per-workspace API key for a provider. Encrypted at rest. |

## Cross-Cutting Conventions

These apply to every phase and every feature:

- **Workspace scoping:** Every domain table has `organisation_id` as a foreign key. All queries filter by it. All API routes resolve the active workspace from the session.
- **Routing:** Hub pages live under `/app/**`. The starter's `/admin/**` (platform administration) stays untouched apart from one new sub-page for the model registry. `/` is reserved for future marketing content. See `design.md` §DESIGN-ROUTES.
- **Soft deletes:** Every domain table has `deleted_at`. Hard deletes are forbidden in the orchestrator and discouraged elsewhere.
- **ULIDs:** Primary keys follow the starter convention.
- **Vertical slices:** New features go into `app/features/{name}/` and `server/features/{name}/`, mirroring the starter's structure.
- **Permissions:** New permissions follow the existing naming scheme (`kb:read`, `todo:create`, etc.) and integrate with `requirePermission()`.
- **Pinia Colada** for client-side server-state caching, following the starter's query-key conventions.
- **Zod** for all input validation on API routes.
- **i18n** via `@nuxtjs/i18n` from day one (de + en); no hardcoded user-facing strings.
- **AI provider abstraction** via Vercel AI SDK; providers, models, and credentials live in the DB, not in env vars.

## Out of Scope

To keep the spec focused, the following are explicitly **not** part of this build:

- Multi-user collaboration features (sharing, real-time editing). Single user across multiple workspaces is supported; multi-user per workspace is not optimised for.
- GitHub write integration (creating issues, PRs, etc.).
- Webhook-based GitHub sync. Polling only.
- Mobile apps. Web-responsive only.
- Full-blown vector search at launch — `pgvector` is installed but used only when explicitly enabled in a later iteration.
- A dedicated commit-processing pipeline. The orchestrator handles commit-to-KB conversion on demand via prompt (see ADR-005).
