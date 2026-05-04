# Design

How the system is built. This file is the implementation reference: data model, API contracts, MCP tool contracts, and architectural notes.

References to requirements use the format `REQ-KB-3`. References to ADRs use `ADR-001`.

---

## DESIGN-ARCH — Architecture overview

The hub is built on the `nuxt-drizzle` starter. It reuses:

- **Auth** (sessions, RBAC, anonymous-to-credentials upgrade) — unchanged.
- **Multi-tenancy** — workspaces are organisations (ADR-001).
- **Vertical slice layout** — every new feature is a slice in `app/features/{name}` and `server/features/{name}`.
- **DI container** — services are registered in `server/utils/container.ts`.
- **ItemService** — generic CRUD with filter operators is reused for simple cases.
- **Event bus** — used for cross-feature side effects (e.g. wikilink reparsing on entry update).
- **Pinia Colada** — for client-side server-state caching.

### New top-level slices

```
app/features/
├── kb/                    # Knowledge Base (Phase 1)
├── todos/                 # Todos (Phase 2)
├── orchestrator/          # AI chat + MCP client (Phase 3)
├── ai/                    # AI provider/model configuration (Phase 3)
└── projects/              # GitHub-backed projects (Phase 4)

server/features/
├── kb/
├── todos/
├── orchestrator/          # Includes Self-MCP server, tool implementations, audit log
├── ai/                    # Provider abstraction, credentials, model registry
└── projects/              # Includes GitHub client and sync job
```

### Routing convention

- `/admin/**` — starter-owned platform administration. **Untouched by this spec** except for one new admin page (`/admin/ai/models`) for the platform-global model registry.
- `/app/**` — every page introduced by this spec (KB, Todos, Projects, Orchestrator, workspace settings) lives here. See DESIGN-ROUTES for the full mapping.
- `/` and other top-level routes are reserved for future marketing/landing content if the hub ever becomes a SaaS.

### Key cross-cutting modules

- `server/features/kb/markdown.ts` — Markdown parsing, wikilink extraction, slug generation.
- `server/features/orchestrator/mcp-server.ts` — Self-MCP server entry; registers tools.
- `server/features/orchestrator/tools/` — One file per tool, both for code clarity and to make tool registration declarative.
- `server/features/projects/github-client.ts` — Octokit wrapper with token resolution per workspace.

---

## DESIGN-DATA — Data model

All tables include the starter's conventions: ULID primary key, `created_at`, `updated_at`, soft-delete `deleted_at` where applicable, and `organisation_id` foreign key for tenant isolation.

### KB tables

#### `kb_entries`
| Column | Type | Notes |
|---|---|---|
| `id` | ulid | PK |
| `organisation_id` | ulid | FK organisations |
| `slug` | text | Unique per `organisation_id`, derived from title |
| `title` | text | |
| `body_md` | text | Markdown source |
| `body_search` | tsvector | Generated column for FTS (REQ-KB-5) |
| `category_id` | ulid | FK kb_categories, nullable |
| `status` | enum | `inbox` \| `draft` \| `verified` \| `archived` |
| `author_type` | enum | `human` \| `ai` |
| `author_name` | text | |
| `source_type` | enum | `manual` \| `commit` \| `claude_code_session` \| `chat` \| `external` |
| `source_ref` | text | nullable |
| `created_by` | ulid | FK users (the user under whose session this was created — for AI entries this is still the user) |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |
| `deleted_at` | timestamptz | nullable |

Indexes: `(organisation_id, slug)` unique, `(organisation_id, status)`, `(organisation_id, category_id)`, GIN on `body_search`.

#### `kb_categories`
| Column | Type | Notes |
|---|---|---|
| `id` | ulid | PK |
| `organisation_id` | ulid | FK |
| `parent_id` | ulid | self-FK, nullable |
| `name` | text | |
| `slug` | text | unique per `organisation_id` |
| `created_at`, `updated_at` | | |

#### `kb_tags`
| Column | Type | Notes |
|---|---|---|
| `id` | ulid | PK |
| `organisation_id` | ulid | FK |
| `name` | text | unique per `organisation_id` (case-insensitive) |
| `created_at`, `updated_at` | | |

Reused by todos (REQ-TODO-4).

#### `kb_entry_tags` (junction)
| Column | Type | Notes |
|---|---|---|
| `entry_id` | ulid | FK kb_entries, PK part |
| `tag_id` | ulid | FK kb_tags, PK part |

#### `kb_entry_links`
| Column | Type | Notes |
|---|---|---|
| `id` | ulid | PK |
| `from_entry_id` | ulid | FK kb_entries |
| `to_entry_id` | ulid | FK kb_entries, nullable when unresolved |
| `to_slug` | text | the original slug used in `[[…]]` — kept even when resolved, useful when target is later renamed |
| `resolved` | boolean | |

Materialised by the markdown parser on entry save. See DESIGN-WIKILINKS.

### Todo tables

#### `todos`
| Column | Type | Notes |
|---|---|---|
| `id` | ulid | PK |
| `organisation_id` | ulid | FK |
| `parent_todo_id` | ulid | self-FK, nullable |
| `title` | text | |
| `description_md` | text | nullable |
| `priority` | enum | `low` \| `medium` \| `high` \| `urgent`, default `medium` |
| `due_at` | timestamptz | nullable |
| `completed_at` | timestamptz | nullable |
| `created_by` | ulid | FK users |
| `created_at`, `updated_at`, `deleted_at` | | |

Indexes: `(organisation_id, completed_at)`, `(organisation_id, due_at)`, `(parent_todo_id)`.

#### `todo_tags` (junction, reuses `kb_tags`)
| Column | Type | Notes |
|---|---|---|
| `todo_id` | ulid | FK todos |
| `tag_id` | ulid | FK kb_tags |

#### `todo_kb_links`
| Column | Type | Notes |
|---|---|---|
| `todo_id` | ulid | FK todos |
| `entry_id` | ulid | FK kb_entries |

### Projects (GitHub) tables

#### `gh_connections`
| Column | Type | Notes |
|---|---|---|
| `id` | ulid | PK |
| `organisation_id` | ulid | FK, unique (one connection per workspace) |
| `token_encrypted` | text | encrypted at rest with app secret |
| `gh_user_login` | text | |
| `created_at`, `updated_at` | | |

#### `gh_repos`
| Column | Type | Notes |
|---|---|---|
| `id` | ulid | PK |
| `organisation_id` | ulid | FK |
| `gh_id` | bigint | GitHub's repo id |
| `owner` | text | |
| `name` | text | |
| `private` | boolean | |
| `tracked` | boolean | true if user opted to sync this repo |
| `last_synced_at` | timestamptz | nullable |
| `created_at`, `updated_at`, `deleted_at` | | |

#### `gh_issues`, `gh_pulls`, `gh_commits`
Similar shape: `(id, organisation_id, repo_id, gh_id, …payload-specific fields…, created_at, updated_at)`. See `tasks.md` Phase 4 for exact columns.

### Orchestrator tables

#### `orchestrator_conversations`
| Column | Type | Notes |
|---|---|---|
| `id` | ulid | PK |
| `organisation_id` | ulid | FK |
| `user_id` | ulid | FK users |
| `title` | text | auto-generated from first message, editable |
| `mode` | enum | `read_only` \| `read_write` |
| `created_at`, `updated_at` | | |

#### `orchestrator_messages`
| Column | Type | Notes |
|---|---|---|
| `id` | ulid | PK |
| `conversation_id` | ulid | FK |
| `role` | enum | `user` \| `assistant` \| `tool_result` |
| `content` | jsonb | structured Anthropic content blocks |
| `created_at` | | |

#### `orchestrator_actions` (audit log)
| Column | Type | Notes |
|---|---|---|
| `id` | ulid | PK |
| `organisation_id` | ulid | FK |
| `conversation_id` | ulid | FK |
| `message_id` | ulid | FK |
| `user_id` | ulid | FK users |
| `tool_name` | text | |
| `parameters` | jsonb | |
| `confirmed` | boolean | true if user-confirmed, false if auto-executed |
| `result` | jsonb | nullable on failure |
| `error` | text | nullable |
| `created_at` | | |

### AI Provider tables

#### `ai_providers`
Global registry of supported providers. Seeded; users normally don't add new ones (unless a new SDK provider becomes available).

| Column | Type | Notes |
|---|---|---|
| `id` | ulid | PK |
| `key` | text | unique, e.g. `anthropic`, `openai`, `google`, `openrouter` |
| `display_name` | text | e.g. "Anthropic", "OpenAI", "Google" |
| `sdk_provider_id` | text | The Vercel AI SDK provider id used in code (e.g. `anthropic`, `openai`, `google`) |
| `enabled` | boolean | Allows admins to disable providers globally |
| `created_at`, `updated_at` | | |

#### `ai_provider_credentials`
API keys per provider. Per-workspace (workspace owner sets up). Encrypted at rest.

| Column | Type | Notes |
|---|---|---|
| `id` | ulid | PK |
| `organisation_id` | ulid | FK |
| `provider_id` | ulid | FK ai_providers |
| `api_key_encrypted` | text | AES-256-GCM, see DESIGN-CRYPTO |
| `base_url` | text | nullable, override for OpenAI-compatible endpoints (e.g. local Ollama, OpenRouter) |
| `created_at`, `updated_at` | | |
| | | Unique on (organisation_id, provider_id) |

#### `ai_models`
The actual selectable models. Seeded with sensible defaults; users can add custom entries (e.g. when a new model is released and not yet in the seed).

| Column | Type | Notes |
|---|---|---|
| `id` | ulid | PK |
| `provider_id` | ulid | FK ai_providers |
| `model_id` | text | The provider-side identifier, e.g. `claude-sonnet-4-5`, `gpt-4o`, `gemini-2.5-pro` |
| `display_name` | text | UI label |
| `context_window` | integer | tokens |
| `supports_tools` | boolean | required true for orchestrator use |
| `supports_streaming` | boolean | |
| `supports_vision` | boolean | for future use |
| `input_price_per_mtok` | numeric(10,4) | nullable, for cost display |
| `output_price_per_mtok` | numeric(10,4) | nullable |
| `enabled` | boolean | Hide deprecated models without deleting them (audit log references) |
| `is_default` | boolean | Exactly one row may have this true; used as system-wide default |
| `created_at`, `updated_at` | | |
| | | Unique on (provider_id, model_id) |

#### `orchestrator_workspace_settings`
Per-workspace AI configuration.

| Column | Type | Notes |
|---|---|---|
| `organisation_id` | ulid | PK, FK |
| `default_model_id` | ulid | FK ai_models, nullable (falls back to global default) |
| `ai_display_name` | text | Default `"Claude-Orchestrator"`, used in `author_name` for AI-created KB entries |
| `history_limit` | integer | Default 30 |
| `created_at`, `updated_at` | | |

#### Updates to existing orchestrator tables

`orchestrator_conversations` gets one new column:

| Column | Type | Notes |
|---|---|---|
| `model_id` | ulid | FK ai_models, nullable. If null, resolves at request time to workspace default → global default. |

This way each conversation can pin a specific model (useful for "use the cheap one for this triage chat") and audit entries reflect which model executed.

`orchestrator_actions` gets one new column:

| Column | Type | Notes |
|---|---|---|
| `model_id` | ulid | FK ai_models, nullable | The model that requested this tool call. Useful for cost tracking and debugging. |

---

## DESIGN-WIKILINKS — Wikilink processing

- On entry save, parse `body_md` for `[[slug]]` patterns (also accept `[[Title|slug]]` for explicit display text).
- Slug used for resolution is the second form's right side, or in the simple case the only token, lowercased and slugified the same way as title-derived slugs.
- After parsing, run a transaction:
  1. Resolve each extracted slug against `kb_entries` in the same workspace.
  2. Replace all rows in `kb_entry_links` for `from_entry_id = currentEntry.id`.
- Backlinks (REQ-KB-4) are computed by querying `kb_entry_links WHERE to_entry_id = current_entry.id`.
- A nightly job re-resolves unresolved links — cheap, runs through `Nitro scheduled tasks` (the starter already has these).

---

## DESIGN-RANK — Orchestrator context ranking

When the orchestrator pulls KB context for a query, the `kb_search` tool's results are scored as follows:

```
score = base_relevance (tsvector rank)
      * status_weight     # verified=1.0, draft=0.7
      * author_weight     # human=1.0, ai=0.85
      * recency_weight    # exp decay over 180 days, floor 0.6
```

`inbox` and `archived` are excluded by default. Pure recency is not used as a primary sort to avoid swamping older but more reliable verified content.

---

## DESIGN-CONF — Confirmation classification

Tools are classified as **auto** (executes immediately) or **confirm** (user must approve in chat UI):

| Tool | Class | Reasoning |
|---|---|---|
| All `*_search`, `*_get`, `*_list` | auto | Read-only |
| `kb_create_entry` (status=`inbox`) | auto | Goes to inbox; user reviews anyway |
| `kb_create_entry` (status≠`inbox`) | confirm | Direct publication |
| `kb_update_entry` | confirm | Modifies existing content |
| `kb_set_status` | confirm | Status changes can promote AI content |
| `kb_add_tag`, `kb_link_entries` | auto | Low-impact organisational changes |
| `kb_soft_delete` | confirm | |
| `todo_create` | auto | Easy to undo |
| `todo_update`, `todo_complete` | auto | Easy to undo |
| `todo_soft_delete` | confirm | |
| Any tool with > 5 affected items | confirm | Bulk changes need approval |

The "bulk changes" rule is enforced server-side: if a tool's parameters or result indicate ≥6 affected entities, the orchestrator returns a confirmation request to the chat instead of executing.

---

## DESIGN-API — REST API endpoints

The starter's pattern: thin route → service. Endpoints are grouped per slice. All routes require auth and resolve workspace from the active session/header `X-Organisation-Id` (the starter's existing convention).

### KB
```
POST   /api/kb/entries                      # Create
GET    /api/kb/entries                      # List with filters: status, category, tag, q (FTS)
GET    /api/kb/entries/[id]                 # Get
PATCH  /api/kb/entries/[id]                 # Update title/body/status/category
DELETE /api/kb/entries/[id]                 # Soft delete
POST   /api/kb/entries/[id]/restore         # Undelete
GET    /api/kb/entries/[id]/backlinks       # Backlinks list
POST   /api/kb/entries/[id]/tags            # Replace tag set
GET    /api/kb/inbox                        # Status=inbox view
GET    /api/kb/trash                        # Soft-deleted

POST   /api/kb/categories
GET    /api/kb/categories                   # Tree
PATCH  /api/kb/categories/[id]
DELETE /api/kb/categories/[id]

GET    /api/kb/tags                         # All tags in workspace
POST   /api/kb/tags                         # Create (also auto-created on use)
DELETE /api/kb/tags/[id]                    # Cleanup unused
```

### Todos
```
POST   /api/todos
GET    /api/todos                           # filters: view (today|upcoming|open|completed|priority), tag
GET    /api/todos/[id]
PATCH  /api/todos/[id]                      # title, description, priority, due_at
POST   /api/todos/[id]/complete             # set completed_at = now
POST   /api/todos/[id]/uncomplete
DELETE /api/todos/[id]                      # soft delete
POST   /api/todos/[id]/kb-links             # Replace KB link set
POST   /api/todos/[id]/tags                 # Replace tag set
```

### Projects
```
POST   /api/projects/connection             # Save token, validate
DELETE /api/projects/connection             # Revoke
GET    /api/projects/repos                  # List + tracked flag
PATCH  /api/projects/repos/[id]             # Toggle tracked
POST   /api/projects/repos/[id]/sync        # Manual sync
GET    /api/projects/repos/[id]/issues
GET    /api/projects/repos/[id]/pulls
GET    /api/projects/repos/[id]/commits
```

### Orchestrator
```
POST   /api/orchestrator/conversations              # Create
GET    /api/orchestrator/conversations              # List
GET    /api/orchestrator/conversations/[id]         # Get with messages
PATCH  /api/orchestrator/conversations/[id]         # Title, mode
DELETE /api/orchestrator/conversations/[id]
POST   /api/orchestrator/conversations/[id]/messages  # Send user message; streams assistant reply via SSE
POST   /api/orchestrator/conversations/[id]/confirm   # Confirm a pending tool call
POST   /api/orchestrator/conversations/[id]/cancel    # Cancel a pending tool call

GET    /api/orchestrator/audit                      # Audit log (permission-gated)
```

### AI Configuration
```
GET    /api/ai/providers                            # List providers (id, key, display_name, enabled)
GET    /api/ai/models                               # List models, filtered by enabled + has_credentials_in_current_workspace
POST   /api/ai/models                               # Admin: create custom model entry
PATCH  /api/ai/models/[id]                          # Admin: edit (capabilities, prices, enabled, is_default)
DELETE /api/ai/models/[id]                          # Admin: delete (only if no orchestrator_actions reference it)

GET    /api/ai/credentials                          # Workspace's stored credentials (provider keys, base_urls — never the api_key itself, only a "configured" boolean)
PUT    /api/ai/credentials/[providerId]             # Save/replace api_key (+ optional base_url) for a provider in this workspace
DELETE /api/ai/credentials/[providerId]             # Remove credentials for a provider

GET    /api/ai/workspace-settings                   # Workspace orchestrator settings
PATCH  /api/ai/workspace-settings                   # Update default_model_id, ai_display_name, history_limit
```

The Self-MCP server is **not** exposed over HTTP for external clients in this build. It is invoked in-process by the orchestrator's chat handler. See ADR-006.

---

## DESIGN-TOOLS — MCP tool contracts

Tools are grouped by slice. Each tool has: `name`, `description`, `input_schema` (Zod, mapped to JSON Schema for the Anthropic API), `class` (auto / confirm), `read_or_write`.

> **Note:** Schemas below are described informally. The implementation defines them in Zod. Each tool implementation lives in `server/features/orchestrator/tools/{tool-name}.ts`.

### Read tools (always available)

#### `kb_search`
- **Description:** Search KB entries by full-text query, optionally filtered.
- **Inputs:** `query: string`, `tags?: string[]`, `category_slug?: string`, `status?: ('inbox'|'draft'|'verified'|'archived')[]` (default `['draft','verified']`), `limit?: number` (default 10, max 25).
- **Returns:** Array of `{id, slug, title, snippet, status, author_type, author_name, score}`.

#### `kb_get_entry`
- **Inputs:** `slug_or_id: string`, `include_backlinks?: boolean`.
- **Returns:** Full entry with metadata; if requested, backlinks list.

#### `kb_list_categories` — tree of categories.

#### `kb_list_tags` — tags with usage counts.

#### `todo_search`
- **Inputs:** `query?: string`, `view?: 'today'|'upcoming'|'open'|'completed'`, `priority?: ...`, `tags?: string[]`, `linked_to_kb?: string` (slug or id), `limit?: number`.

#### `todo_get` — single todo, including subtasks and linked KB entries.

#### `project_list_repos`, `project_list_issues`, `project_list_pulls`, `project_list_commits` — read-only views over the cached GitHub data. Filters: state, since, q.

### Write tools (only when conversation mode is `read_write`)

#### `kb_create_entry`
- **Inputs:** `title`, `body_md`, `status?: 'inbox'|'draft'|'verified'` (default `inbox`), `category_slug?`, `tags?: string[]`, `source_type?` (default `chat`), `source_ref?` (default conversation id).
- **Class:** `auto` if `status='inbox'`, else `confirm`.
- **Author:** Set automatically by the server (REQ-ORCH-7).

#### `kb_update_entry`
- **Inputs:** `slug_or_id`, partial of `title|body_md|category_slug`.
- **Class:** `confirm`.

#### `kb_set_status`
- **Inputs:** `slug_or_id`, `status`.
- **Class:** `confirm`.

#### `kb_add_tag`, `kb_remove_tag`
- **Class:** `auto`.

#### `kb_link_entries`
- **Inputs:** `from_slug_or_id`, `to_slug_or_id`, `direction: 'one_way'|'both'` (one-way inserts a wikilink in `from`'s body; both inserts in both bodies).
- **Class:** `auto`.

#### `kb_soft_delete_entry`
- **Class:** `confirm`.

#### `todo_create`
- **Inputs:** `title`, `description_md?`, `priority?`, `due_at?`, `parent_todo_id?`, `tags?: string[]`, `kb_links?: string[]` (slugs or ids).
- **Class:** `auto`.

#### `todo_update`
- **Inputs:** id + partial fields. Class: `auto` for non-destructive fields.

#### `todo_complete`, `todo_uncomplete` — `auto`.

#### `todo_soft_delete` — `confirm`.

#### `todo_link_kb`, `todo_unlink_kb` — `auto`.

### Tools NOT provided

Per REQ-ORCH-8 and ADR-002, no generic "modify" or "execute SQL" tools. No GitHub write tools (REQ-PROJ-5 / ADR-007).

---

## DESIGN-CHAT — Chat request flow

1. User sends a message via `POST /api/orchestrator/conversations/[id]/messages`.
2. Server appends the user message, loads recent conversation history (last 30 messages, configurable), and constructs an Anthropic API request with:
   - The system prompt (workspace context, current date, available tools description).
   - The tool list (read-only or read+write depending on conversation mode).
3. Server streams the assistant response back to the client via SSE.
4. When the model calls a tool:
   - **Auto tools:** the server executes immediately, appends the result as a `tool_result` message, and continues the loop.
   - **Confirm tools:** the server pauses, persists a `pending_tool_call` record, and emits a `confirmation_required` event to the SSE stream. The client renders a card. The user confirms via `POST .../confirm` or cancels via `.../cancel`. On confirm, server resumes the loop with the tool result.
5. Every executed tool is appended to `orchestrator_actions`.

The loop terminates when the model returns a turn with no tool calls.

---

## DESIGN-CRYPTO — Secret storage and encryption

The hub stores two kinds of third-party secrets: GitHub PATs (`gh_connections.token_encrypted`) and AI provider API keys (`ai_provider_credentials.api_key_encrypted`). Both use the same scheme:

- Algorithm: AES-256-GCM.
- Key derivation: HKDF-SHA256 from `NUXT_AUTH_SECRET` plus a per-organisation salt (stable, generated on workspace creation, stored on the organisation row as `crypto_salt`).
- IV: 12 random bytes per encryption operation, stored alongside the ciphertext (`<iv>:<ciphertext>:<tag>` base64-joined).
- Decryption happens only at request time, in the relevant client wrapper (GitHub client, AI SDK provider builder).

A shared utility module `server/utils/crypto.ts` exposes `encryptForOrg(orgId, plaintext)` and `decryptForOrg(orgId, ciphertext)`. Both the GitHub and AI features use it.

---

## DESIGN-RBAC — Permission integration

New permissions added to `server/features/rbac/permissions.ts`:

```
kb:read
kb:write
kb:delete
todo:read
todo:write
todo:delete
project:read
project:manage
orchestrator:use
orchestrator:write
orchestrator:audit:view
ai:read                  # See which providers/models are configured for the workspace
ai:manage                # Configure provider credentials, default model, ai display name
```

Default role assignments (extending the starter's seed data):

| Role | New permissions |
|---|---|
| Owner | all of the above |
| Admin | all except `orchestrator:audit:view` and `ai:manage` |
| Member | `*:read`, `kb:write`, `todo:write`, `orchestrator:use`, `orchestrator:write` |

API routes use `requirePermission()` with these.

---

## DESIGN-AI — AI provider abstraction (Vercel AI SDK)

The orchestrator uses the **Vercel AI SDK** (`ai` package + provider packages: `@ai-sdk/anthropic`, `@ai-sdk/openai`, `@ai-sdk/google`) as the unified interface to LLM providers. This decouples the orchestrator from any single vendor and lets the user pick the best model per task.

### Why the AI SDK

- One API for `streamText`, `generateText`, tool calls, and structured output across providers.
- Provider-side differences (system prompt placement, tool-call format, streaming protocol) are abstracted away.
- The MCP-style tool registry (DESIGN-TOOLS) maps cleanly onto the SDK's `tools` parameter.

### Provider-Model resolution flow

When the orchestrator handles a chat request:

1. Resolve the model: explicit `conversation.model_id` → `orchestrator_workspace_settings.default_model_id` → `ai_models WHERE is_default=true`.
2. Look up the model's provider, fetch the workspace's `ai_provider_credentials` row for that provider, decrypt the API key.
3. Construct the SDK provider client at request time:
   ```
   const provider = createAnthropic({ apiKey })   // or createOpenAI / createGoogleGenerativeAI
   const model = provider(ai_model.model_id)
   ```
4. Call `streamText({ model, messages, tools, ... })`.

Provider clients are **not cached across requests** — keeps things simple, cost is negligible, and avoids stale-key issues after credential rotation.

### Capability validation

Before assigning a model to an orchestrator conversation, the server checks:

- `supports_tools = true` (orchestrator depends on tool calls).
- `supports_streaming = true` (UI assumes streaming).

Models that don't satisfy these are filtered out of the model picker UI.

### Seed data

Initial seed for `ai_providers`: Anthropic, OpenAI, Google.
Initial seed for `ai_models`: a small curated list of the currently-recommended frontier models from each provider, with one marked `is_default=true`. The exact list is maintained in `server/database/seed/ai-models.ts` and is expected to evolve over time (this is normal — that's why models are in the DB).

### Adding a new model

Two paths:
- **Admin UI** (preferred): super admin opens `/admin/ai/models`, fills out provider, model id, display name, capabilities, prices. New row in `ai_models`.
- **Seed update**: developer adds an entry to the seed file; runs migration.

Both paths produce identical results.

### Cost tracking (Phase 3 nice-to-have, see T-NTH-5)

Because `ai_models` carries prices and `orchestrator_actions` records the model used, a follow-up tool/dashboard can sum usage per workspace. Out of scope for the initial Phase 3.

---

## DESIGN-I18N — Internationalisation

The hub uses `@nuxtjs/i18n` from day one with two locales: `de` (default) and `en`.

### Conventions

- All user-facing strings live in locale files: `i18n/locales/de.json`, `i18n/locales/en.json`.
- Translation keys follow a feature-prefixed dot path: `kb.inbox.title`, `todo.priority.high`, `orchestrator.confirmation.confirm_button`.
- Server-emitted error messages (Zod, business errors) return a stable `code` (e.g. `KB_SLUG_TAKEN`); the client maps codes to translated strings.
- Date and number formatting use Nuxt i18n's built-in `$d()` and `$n()` helpers.
- The active language is stored in user preferences (extending the starter's profile) and falls back to browser language, then to `de`.

### What's NOT translated

- Code identifiers, comments, log messages, error codes, audit log entries — all English.
- The spec itself — English (this file).
- Markdown content the user writes — pass-through.

This keeps the codebase searchable and AI-agent-friendly while still serving a German-first UI.

---

## DESIGN-ENV — Environment variables

Added to `.env.example`:

```
# Orchestrator (no API keys here — they live encrypted in the DB, see DESIGN-AI)
NUXT_ORCHESTRATOR_HISTORY_LIMIT=30        # default, can be overridden per workspace

# GitHub
NUXT_GITHUB_SYNC_INTERVAL_MINUTES=15
NUXT_GITHUB_COMMITS_PER_SYNC=50

# i18n
NUXT_PUBLIC_I18N_DEFAULT_LOCALE=de
```

API keys for AI providers are **not** environment variables. They are stored encrypted in `ai_provider_credentials` (see DESIGN-AI and DESIGN-CRYPTO). The only crypto-relevant env var is `NUXT_AUTH_SECRET`, which the starter already requires.

---

## DESIGN-ROUTES — Top-level route structure

The hub is built on a starter that already uses `/admin/**` for **platform administration** (managing all users, all organisations, etc.). To keep that intact and to leave room for marketing pages later if this becomes a SaaS, the route layout is:

| Prefix | Purpose | Auth |
|---|---|---|
| `/` | Marketing / landing pages (out of scope; placeholder for later) | Public |
| `/auth/**` | Existing starter auth flows (sign-in, sign-up, etc.) | Public |
| `/admin/**` | Platform administration — **starter-owned, mostly untouched by this spec** | `platform:admin` |
| `/app/**` | The hub itself: KB, Todos, Projects, Orchestrator, workspace settings | Authenticated, with workspace context |

### What goes where

**Stays under `/admin` (platform-global, super-admin only):**
- All existing starter admin pages (users, organisations, teams, auth providers, …) — unchanged.
- `/admin/ai/models` — the model registry. Models are platform-global (every workspace sees the same list), so this naturally belongs to platform admin.

**New under `/app` (workspace-scoped, regular users):**
- `/app` — dashboard / landing inside the hub.
- `/app/kb/**` — KB list, detail, inbox, trash, categories.
- `/app/todos/**` — todo views.
- `/app/projects/**` — GitHub-backed projects.
- `/app/orchestrator/**` — chat list and individual conversations.
- `/app/settings/ai` — workspace AI configuration (provider credentials, default model, AI display name).
- `/app/settings/audit` — orchestrator audit log (workspace-scoped, gated by `orchestrator:audit:view`).
- `/app/settings/github` — GitHub connection (PAT, tracked repo selection).

### Workspace context resolution

The starter already resolves the active organisation from the session (or `X-Organisation-Id` header). Under `/app/**`, this stays the same: every page and API call operates in the active workspace. Switching workspace happens via the existing workspace switcher in the top nav.

### Layout split

A new layout `app/layouts/app.vue` wraps `/app/**` pages with the hub's nav (KB / Todos / Projects / Orchestrator / Settings). The existing `default`, `auth`, and `admin` layouts are not modified.

---

## DESIGN-FRONTEND — UI shell

- **App layout (`/app/**`):**
  - Top nav: workspace switcher (existing), global search (KB + Todos), Orchestrator launcher, language toggle (de/en).
  - Side nav: KB (Inbox / All / Categories / Tags / Trash), Todos (Today / Upcoming / All / Completed / Trash), Projects, Orchestrator, Settings.
- Editor for KB entries: split-view Markdown editor + preview. Wikilinks render as links in preview.
- Orchestrator chat: standard chat UI with tool-call cards, confirmation cards, mode badge, and a model picker per conversation.
- Settings pages (under `/app/settings/**`):
  - `ai` — workspace AI settings: provider credentials (one card per provider showing "Configured / Not configured", with edit + remove), default model picker, AI display name override, history limit override.
  - `github` — GitHub PAT and tracked-repo selection.
  - `audit` — orchestrator audit log (gated by `orchestrator:audit:view`).
- Admin pages under `/admin/**` (super-admin only):
  - `ai/models` — list/create/edit `ai_models` entries.
  - All other `/admin/**` pages from the starter remain unchanged.

UI library: Nuxt UI 4 (per the starter). i18n via `@nuxtjs/i18n`. No new component library.
