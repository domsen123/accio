# Requirements

User stories and acceptance criteria, grouped by feature. Each requirement has a stable ID (e.g. `REQ-KB-3`) for cross-referencing in `design.md` and `tasks.md`.

Format used for acceptance criteria: **EARS-lite** — `WHEN <trigger> THE SYSTEM SHALL <behaviour>` or `THE SYSTEM SHALL <invariant>`.

---

## REQ-WS — Workspaces

> Workspaces are mapped to the starter's existing `organisation` concept. Most requirements come "for free" from the starter; this section documents the integration points relevant to this build.

### REQ-WS-1 — Workspace selection in the UI

**As a** user with multiple workspaces (e.g. Privat, Arbeit)
**I want** to switch between them with a single click
**So that** I see only data belonging to the active workspace.

**Acceptance:**
- WHEN the user opens any page in the hub THE SYSTEM SHALL display the active workspace's name in the navigation.
- WHEN the user switches workspaces THE SYSTEM SHALL invalidate cached server state and refetch data scoped to the new workspace.
- THE SYSTEM SHALL persist the active workspace per browser session.

### REQ-WS-2 — Data isolation

**Acceptance:**
- THE SYSTEM SHALL include `organisation_id` as a non-nullable foreign key on every domain table introduced by this spec (KB entries, KB tags, todos, todo links, projects, issues, commits, orchestrator chats, audit log entries).
- THE SYSTEM SHALL reject any API request that attempts to read or write data outside the caller's active workspace, returning HTTP 403.

---

## REQ-KB — Knowledge Base

### REQ-KB-1 — Create and edit entries

**As a** user
**I want** to write Markdown notes with a title, body, and metadata
**So that** I have a personal wiki.

**Acceptance:**
- THE SYSTEM SHALL allow creating a KB entry with at minimum: title, Markdown body, status (default `draft` for human / `inbox` for AI).
- THE SYSTEM SHALL support editing the title and body of an existing entry.
- THE SYSTEM SHALL store a slug derived from the title, unique per workspace, and stable across edits unless explicitly regenerated.

### REQ-KB-2 — Tags

**Acceptance:**
- THE SYSTEM SHALL allow assigning zero or more tags to an entry.
- THE SYSTEM SHALL store tags as first-class rows (not as a string array).
- WHEN a tag is no longer used by any entry in a workspace THE SYSTEM SHALL keep the tag (it can be reused) but offer a cleanup action to the user.

### REQ-KB-3 — Categories and hierarchy

**Acceptance:**
- THE SYSTEM SHALL allow assigning at most one category to an entry.
- THE SYSTEM SHALL support nested categories (parent/child) up to a depth of 5.
- THE SYSTEM SHALL allow listing entries by category, including descendants.

### REQ-KB-4 — Wikilinks and explicit references

**As a** user
**I want** to link from one entry to another using `[[slug]]` syntax or an explicit picker
**So that** my knowledge graph stays connected.

**Acceptance:**
- WHEN an entry is saved THE SYSTEM SHALL parse `[[slug]]` patterns and materialise them as rows in `entry_links`.
- WHEN a referenced slug does not exist THE SYSTEM SHALL still save the entry but mark the link as unresolved.
- THE SYSTEM SHALL display backlinks (entries that link **to** the current one) on the entry view.
- THE SYSTEM SHALL provide an explicit "Insert link to entry" picker as an alternative to typing wikilinks.

### REQ-KB-5 — Full-text search

**Acceptance:**
- THE SYSTEM SHALL provide search across title and body using PostgreSQL `tsvector` indexes.
- THE SYSTEM SHALL support filtering search results by tag, category, status, author type, and source type.
- THE SYSTEM SHALL return results ranked by relevance, with title matches weighted higher than body matches.

### REQ-KB-6 — Author and source tracking

**Acceptance:**
- THE SYSTEM SHALL store on every entry: `author_type` (`human` | `ai`), `author_name` (string), `source_type` (`manual` | `commit` | `claude_code_session` | `chat` | `external`), optional `source_ref` (string).
- THE SYSTEM SHALL default human-created entries to `author_type=human`, `author_name=<user's display name>`, `source_type=manual`.
- THE SYSTEM SHALL require AI-creating callers (the Orchestrator and external sources) to supply author and source explicitly.

### REQ-KB-7 — Status lifecycle

**Acceptance:**
- THE SYSTEM SHALL support statuses `inbox`, `draft`, `verified`, `archived`.
- WHEN an entry is created by AI THE SYSTEM SHALL default to `inbox` (or `draft` if the AI is the orchestrator working on the user's direct request — orchestrator passes the chosen status).
- WHEN an entry is created by a human THE SYSTEM SHALL default to `draft`.
- THE SYSTEM SHALL allow the user to transition any entry between any of the four statuses.
- THE SYSTEM SHALL by default exclude `archived` from list and search results, with a toggle to include them.
- THE SYSTEM SHALL by default include `inbox`, `draft`, and `verified` in user-facing search; the orchestrator gets a separate default (see REQ-ORCH-5).

### REQ-KB-8 — Inbox workflow

**As a** user
**I want** a dedicated Inbox view for unprocessed AI-generated entries
**So that** I can quickly triage them.

**Acceptance:**
- THE SYSTEM SHALL provide an Inbox page showing all entries with status `inbox` in the active workspace, ordered by creation date desc.
- THE SYSTEM SHALL provide one-click actions on each inbox entry: "Verify", "Move to Draft", "Archive", "Delete".

### REQ-KB-9 — Soft delete

**Acceptance:**
- THE SYSTEM SHALL soft-delete entries by setting `deleted_at`. Soft-deleted entries are excluded from all queries by default.
- THE SYSTEM SHALL provide a "Trash" view to restore or permanently delete soft-deleted entries.
- THE SYSTEM SHALL forbid the orchestrator from hard-deleting any entry.

---

## REQ-TODO — Todos

### REQ-TODO-1 — Basic todos

**As a** user
**I want** to create todos with a title, optional description (Markdown), priority, and due date
**So that** I can track my tasks.

**Acceptance:**
- THE SYSTEM SHALL allow creating a todo with at minimum a title.
- THE SYSTEM SHALL support optional fields: description (Markdown), priority (`low` | `medium` | `high` | `urgent`), due date, completed_at.
- THE SYSTEM SHALL default priority to `medium`.

### REQ-TODO-2 — Subtasks

**Acceptance:**
- THE SYSTEM SHALL model subtasks via a self-referential `parent_todo_id`.
- THE SYSTEM SHALL allow nesting up to a depth of 3.
- THE SYSTEM SHALL show progress on a parent todo as `n/m` completed subtasks.
- WHEN all subtasks of a parent are completed THE SYSTEM SHALL not auto-complete the parent (explicit user action required).

### REQ-TODO-3 — Linking to KB entries

**Acceptance:**
- THE SYSTEM SHALL allow linking a todo to one or more KB entries via a `todo_kb_links` junction table.
- THE SYSTEM SHALL show linked KB entries on the todo detail view, and show linked todos on the KB entry detail view.

### REQ-TODO-4 — Status and views

**Acceptance:**
- THE SYSTEM SHALL provide views: Today (due today or overdue, not completed), Upcoming (due within 7 days), All Open, All Completed (last 30 days), By Priority.
- THE SYSTEM SHALL allow filtering by tags (todos can have tags reusing the KB tag table — see DESIGN-TAG).

### REQ-TODO-5 — Soft delete

Same as REQ-KB-9, applied to todos.

---

## REQ-PROJ — Projects (GitHub Read-only)

### REQ-PROJ-1 — Connect GitHub

**As a** user
**I want** to connect my GitHub account once
**So that** the hub can sync my repositories.

**Acceptance:**
- THE SYSTEM SHALL accept a GitHub Personal Access Token (fine-grained, read-only scopes) stored encrypted at rest.
- THE SYSTEM SHALL validate the token on submission by hitting `GET /user`.
- THE SYSTEM SHALL allow revoking the connection, which deletes the stored token but retains cached data (user can purge separately).

### REQ-PROJ-2 — Select repositories

**Acceptance:**
- THE SYSTEM SHALL list the repositories accessible by the connected token.
- THE SYSTEM SHALL allow the user to mark which repositories to track per workspace.
- THE SYSTEM SHALL only sync explicitly-tracked repositories.

### REQ-PROJ-3 — Periodic sync

**Acceptance:**
- THE SYSTEM SHALL run a sync job every 15 minutes (configurable, default 15) that updates: repository metadata, open issues, open PRs, last 50 commits per tracked repo.
- THE SYSTEM SHALL also expose a manual "Sync now" button per repository.
- THE SYSTEM SHALL store `last_synced_at` per repository and surface it in the UI.

### REQ-PROJ-4 — Deep-links to github.dev

**Acceptance:**
- WHEN viewing a repository THE SYSTEM SHALL provide a button "Open in github.dev" linking to `https://github.dev/<owner>/<repo>`.
- WHEN viewing an issue or PR THE SYSTEM SHALL link to its GitHub web URL (`https://github.com/<owner>/<repo>/issues/<n>`).

### REQ-PROJ-5 — Read-only display

**Acceptance:**
- THE SYSTEM SHALL display: repository list, per-repo issues list (with state, labels, assignees), per-repo PR list, per-repo commits list (SHA, message, author, date).
- THE SYSTEM SHALL not provide any UI for creating, editing, or commenting on GitHub data.

---

## REQ-ORCH — Orchestrator

### REQ-ORCH-1 — Chat interface

**As a** user
**I want** a chat with an AI that knows my hub
**So that** I can ask questions and trigger actions in natural language.

**Acceptance:**
- THE SYSTEM SHALL provide a chat page with a message input, conversation history, and a workspace selector that defaults to the currently active workspace.
- THE SYSTEM SHALL stream assistant responses token-by-token.
- THE SYSTEM SHALL persist conversations per workspace; the user can list past conversations and resume them.

### REQ-ORCH-2 — Self-MCP server

**Acceptance:**
- THE SYSTEM SHALL expose an internal MCP server with tools (see `design.md` §Tool Contracts).
- THE SYSTEM SHALL split tools into a read-only set and a write set.

### REQ-ORCH-3 — Read/write mode toggle

**As a** user
**I want** to choose whether the orchestrator can write
**So that** I can avoid accidental modifications during pure research.

**Acceptance:**
- THE SYSTEM SHALL provide a per-conversation toggle: "Read-only" (default) and "Read & write".
- WHEN the conversation is read-only THE SYSTEM SHALL only register read tools with the model.
- WHEN switched to "Read & write" mid-conversation THE SYSTEM SHALL register write tools and inform the user inline.

### REQ-ORCH-4 — Confirmation pattern for writes

**Acceptance:**
- WHEN the orchestrator calls a write tool THE SYSTEM SHALL execute it directly only for low-risk tools (see DESIGN-CONF for the classification).
- WHEN the orchestrator calls a high-risk write tool THE SYSTEM SHALL render an interactive confirmation card in the chat showing tool name and parameters; the action SHALL only execute on user confirmation.
- THE SYSTEM SHALL allow the user to cancel a pending action before confirmation.

### REQ-ORCH-5 — Default visibility filters

**Acceptance:**
- WHEN the orchestrator searches the KB without an explicit status filter THE SYSTEM SHALL include `verified` and `draft`, exclude `inbox` and `archived`.
- WHEN the orchestrator is asked to consider unverified content THE SYSTEM SHALL allow including `inbox` via an explicit tool parameter.
- WHEN building context for a response THE SYSTEM SHALL prefer human-authored entries over AI-authored ones, all else equal (see DESIGN-RANK).

### REQ-ORCH-6 — Audit log

**Acceptance:**
- WHEN any write tool is executed (whether confirmed or auto) THE SYSTEM SHALL append a row to `orchestrator_actions` with: tool name, parameters (JSON), result (JSON), conversation id, message id, timestamp, user id.
- THE SYSTEM SHALL provide an admin-only view of the audit log, filterable by workspace and date range.

### REQ-ORCH-7 — Author propagation

**Acceptance:**
- WHEN the orchestrator creates a KB entry THE SYSTEM SHALL set `author_type=ai`, `author_name` to a configured value (default `"Claude-Orchestrator"`, configurable per workspace), `source_type=chat`, `source_ref` to the conversation id.

### REQ-ORCH-8 — Tool granularity

**Acceptance:**
- THE SYSTEM SHALL define tools narrowly. Examples: `kb_search`, `kb_create_entry`, `kb_update_entry`, `kb_set_status`, `kb_add_tag`, `kb_link_entries`, `todo_create`, `todo_update`, `todo_complete`, `todo_link_kb`. Generic "modify" tools are forbidden.

---

## REQ-AI — AI Provider Configuration

### REQ-AI-1 — Multiple providers supported

**As a** user
**I want** to use different LLM providers (Anthropic, OpenAI, Google) interchangeably
**So that** I'm not locked into one vendor and can pick the best model per task.

**Acceptance:**
- THE SYSTEM SHALL support at minimum the following providers via the Vercel AI SDK: Anthropic, OpenAI, Google.
- THE SYSTEM SHALL allow adding more providers via seed data without code changes to the orchestrator core.

### REQ-AI-2 — Per-workspace credentials

**Acceptance:**
- THE SYSTEM SHALL store API keys per workspace (one row per provider per workspace), encrypted at rest using the same scheme as GitHub PATs.
- THE SYSTEM SHALL never return the plaintext API key over any API endpoint after it's been saved (only a "configured: true/false" status).
- THE SYSTEM SHALL allow replacing or removing credentials.

### REQ-AI-3 — Database-driven model registry

**As a** user
**I want** new models to appear in the picker as soon as they're added to the database
**So that** I don't have to redeploy when a new frontier model is released.

**Acceptance:**
- THE SYSTEM SHALL store models in `ai_models` with fields: provider, model id, display name, context window, capability flags (tools, streaming, vision), prices, enabled, is_default.
- THE SYSTEM SHALL allow super admins to add, edit, enable, and disable models via an admin UI.
- THE SYSTEM SHALL prevent deletion of models that are referenced by `orchestrator_actions` rows; disabling is the supported alternative.

### REQ-AI-4 — Model selection

**Acceptance:**
- THE SYSTEM SHALL resolve the active model for a request in this order: conversation `model_id` → workspace `default_model_id` → global default (one row in `ai_models` with `is_default=true`).
- THE SYSTEM SHALL show a model picker on each orchestrator conversation, scoped to models whose provider has credentials configured in the active workspace.
- THE SYSTEM SHALL only show models with `supports_tools=true` and `supports_streaming=true` in the picker.
- THE SYSTEM SHALL allow workspace admins to set the workspace default in settings.

### REQ-AI-5 — Audit-log model attribution

**Acceptance:**
- WHEN a tool is executed THE SYSTEM SHALL record the `model_id` that invoked it in `orchestrator_actions`.

---

## REQ-I18N — Internationalisation

### REQ-I18N-1 — German and English from launch

**As a** German-speaking user with English-speaking colleagues
**I want** to switch the UI language between German and English
**So that** anyone using the hub gets it in their preferred language.

**Acceptance:**
- THE SYSTEM SHALL ship with two locales: `de` (default) and `en`.
- THE SYSTEM SHALL provide a language switcher in the top navigation accessible from any page.
- THE SYSTEM SHALL persist the selected language as a per-user preference and fall back to the browser language for new users.
- THE SYSTEM SHALL format dates and numbers according to the active locale.

### REQ-I18N-2 — Translation key conventions

**Acceptance:**
- THE SYSTEM SHALL store all user-facing strings in locale files; no hardcoded display strings in components.
- THE SYSTEM SHALL use feature-prefixed dot-path keys (e.g. `kb.inbox.title`).
- THE SYSTEM SHALL return server-side error messages as stable error codes; the client maps codes to localised strings.

### REQ-I18N-3 — Pass-through for user content

**Acceptance:**
- THE SYSTEM SHALL not translate user-authored content (KB body, todo descriptions, tag names, etc.). It is rendered as-is.
- THE SYSTEM SHALL not translate orchestrator chat content. The orchestrator responds in whatever language the user writes in.

---

## REQ-COMMON — Cross-cutting

### REQ-COMMON-1 — Permissions

**Acceptance:**
- THE SYSTEM SHALL define new permissions following the existing naming scheme. Minimum set:
  - `kb:read`, `kb:write`, `kb:delete`
  - `todo:read`, `todo:write`, `todo:delete`
  - `project:read`, `project:manage` (for connecting GitHub, selecting repos)
  - `orchestrator:use`, `orchestrator:write` (write actions toggle), `orchestrator:audit:view`
  - `ai:read`, `ai:manage` (configure provider credentials and model defaults per workspace)
- THE SYSTEM SHALL assign the new permissions to the appropriate org roles in seed data (Owner gets all, Member gets read + use).

### REQ-COMMON-2 — Soft delete consistency

THE SYSTEM SHALL implement soft delete identically across all new entities (KB entries, todos, projects, issues, commits): nullable `deleted_at`, default scope filters it out, dedicated trash view per entity.

### REQ-COMMON-3 — Vertical slice structure

THE SYSTEM SHALL place each new feature in `app/features/{name}/` (client) and `server/features/{name}/` (server), mirroring the starter's conventions.

### REQ-COMMON-4 — pgvector ready

THE SYSTEM SHALL install the `pgvector` extension during database setup so it can be used later without a migration. No vector columns are required for Phase 1–4.
