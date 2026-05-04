# Architecture Decision Records (ADRs)

Each record captures a decision, its context, and the alternatives considered. Add a new ADR whenever a decision is made that's likely to be questioned later or that an AI agent might otherwise re-litigate.

Format: short. Status is `accepted` unless explicitly superseded.

---

## ADR-001 — Workspaces are organisations

**Status:** accepted

**Context.** The starter has a fully built multi-tenant `organisation` concept with members, invitations, RBAC, and per-org permission scoping. The user wants "Privat" and "Arbeit" as workspaces.

**Decision.** Map the user-facing "Workspace" term to the existing `organisation` entity. The user creates one organisation per workspace they want.

**Consequences.**
- Zero new infrastructure for tenant isolation.
- All existing RBAC, invitation, and member-management features apply to workspaces for free.
- Slight terminology mismatch in the database (table is `organisations`, UI says "Workspace"). Acceptable: keep DB names as-is, label in UI only.

**Alternatives considered.**
- A separate `workspaces` table parented to `organisations`. Rejected — adds a tier with no current need; can always be added later if multi-workspace-per-org becomes a real requirement.

---

## ADR-002 — No generic "modify" or "execute SQL" orchestrator tools

**Status:** accepted

**Context.** Two extremes for tool design with LLMs: many narrow tools, or few mighty tools (including escape hatches like raw SQL).

**Decision.** Keep tools narrow and named after the user-level intent. No SQL tool, no generic CRUD tool, no "do anything" tool.

**Consequences.**
- Less flexibility for the model. If a user asks something outside the tool surface, the orchestrator says it can't do that — preferred over silent overreach.
- Easier to audit, classify (auto vs confirm), and permission-gate.
- Lower hallucination/misuse risk.

---

## ADR-003 — GitHub is read-only and source of truth

**Status:** accepted

**Context.** Two-way sync with conflict resolution is expensive. The user wants visibility, not workflow ownership.

**Decision.** GitHub PAT is read-only scoped. Issues, PRs, and commit metadata are cached locally; the local cache never writes back. Updates flow GitHub → hub only. Edits happen on GitHub via deep-links (including `github.dev`).

**Consequences.**
- No conflict handling. Cache may be stale up to one sync interval (default 15 min).
- The orchestrator cannot create or comment on GitHub issues. If that's wanted later, it's a deliberate scope expansion with a new ADR.

---

## ADR-004 — Polling, not webhooks

**Status:** accepted

**Context.** Webhooks are more efficient but require a publicly reachable endpoint, signature verification, and queueing. For a personal hub, that's overhead without proportional benefit.

**Decision.** Periodic polling via Nitro scheduled tasks. Default 15 minutes, configurable. Plus a manual "Sync now" button per repository.

**Consequences.**
- Simpler ops (Coolify deploy stays trivial, no public webhook URL to expose).
- Up to one interval of staleness.
- Slightly more API quota usage. With personal-use volumes, well within GitHub's limits.

---

## ADR-005 — No dedicated commit-processing pipeline

**Status:** accepted

**Context.** It's tempting to build automatic "watch commits, generate KB entries". But that's a meaningful subsystem (queue, scheduling, error handling, AI cost management).

**Decision.** Don't build it. Cache commit metadata as part of the GitHub sync. When the user wants KBs from commits, they prompt the orchestrator: "look at the last week of commits in repo X and draft KB entries". The orchestrator uses its existing tools (`project_list_commits`, `kb_create_entry`) to do it.

**Consequences.**
- Heuristic: **if the orchestrator can do it via prompt, don't build a feature for it.** This applies to weekly summaries, tag consolidation, staleness reports, etc.
- The hub stays small. New "automation" emerges as orchestrator prompts, optionally codified later as scheduled prompts if the user wants.

---

## ADR-006 — Self-MCP is in-process, not HTTP

**Status:** accepted

**Context.** "Self-MCP" can mean either (a) running a real MCP server we also expose on a port, so external clients (Claude Desktop, etc.) can use it, or (b) keeping the MCP-style tool registry in-process and having the chat handler call it directly.

**Decision.** In-process for now. The tool definitions follow the MCP shape (so we *could* expose them later), but the orchestrator chat invokes them directly without going through an HTTP transport.

**Consequences.**
- Simpler. No extra surface to secure.
- If the user later wants to use the same hub from Claude Desktop, expose the registry over MCP transport — the tool implementations don't change.
- Users referring to "MCP" in product copy still works; the protocol shape is honoured.

---

## ADR-007 — AI may write to KB; humans verify

**Status:** accepted

**Context.** AI-generated KB entries risk "AI slop" filling up the knowledge base. But blocking AI writes loses the value of capturing knowledge from Claude Code sessions, commits, and chats.

**Decision.** AI is allowed to write KB entries. Author and source are tracked as first-class fields. AI-created entries default to `inbox` status. Search and orchestrator context exclude `inbox` by default. The user has a dedicated Inbox view to triage. Verified entries (human-promoted) are weighted higher than AI-authored ones in orchestrator context ranking.

**Consequences.**
- The KB always has a clear "what I've vetted" boundary.
- The orchestrator never reinforces its own unverified output by default (it only sees `verified` and `draft` by default).
- The user's curation effort stays bounded — Inbox triage is a focused activity rather than continuous gatekeeping.

---

## ADR-008 — Tags are first-class rows, not arrays

**Status:** accepted

**Context.** Postgres allows `text[]` columns. Convenient for prototyping but makes querying, renaming, and counting tags harder.

**Decision.** Tags are rows in `kb_tags`, junctioned via `kb_entry_tags` and `todo_tags`. Tag names are unique per workspace, case-insensitive.

**Consequences.**
- Renaming a tag is one update.
- Cleanup of unused tags is straightforward.
- Slightly more migration work upfront.

---

## ADR-009 — Soft delete everywhere, no hard delete from orchestrator

**Status:** accepted

**Context.** The orchestrator can mistakes-at-scale.

**Decision.** Every domain table has `deleted_at`. Default scopes filter it out. The orchestrator's tools only soft-delete. Hard delete is reserved for explicit user action in the Trash UI.

**Consequences.**
- "Undo" is always at most one click away.
- Mild storage growth — acceptable for personal use.

---

## ADR-010 — Confirmation classification is per-tool, with a bulk override

**Status:** accepted

**Context.** Confirming every write is annoying. Confirming nothing is risky.

**Decision.** Each tool is classified `auto` or `confirm` based on reversibility and impact (see DESIGN-CONF). Additionally, any tool execution that would touch ≥6 entities is auto-promoted to `confirm`, regardless of its base class.

**Consequences.**
- Most everyday actions feel snappy.
- Bulk changes always get a checkpoint.
- The classification table is centralised in `design.md`; changing it requires one edit.

---

## ADR-011 — pgvector installed but not used at launch

**Status:** accepted

**Context.** The orchestrator might benefit from semantic search later. Adding `pgvector` to a running production DB is doable but disruptive.

**Decision.** Install `pgvector` as part of initial setup. No vector columns or embedding workflows in Phase 1–4. When the user wants semantic search, it becomes a feature-flagged tool added in a follow-up phase.

**Consequences.**
- No-cost optionality.
- Avoids YAGNI by not building the embedding pipeline now.

---

## ADR-012 — Multilingual UI from launch (de + en) via @nuxtjs/i18n

**Status:** accepted

**Context.** The user works in German but may want English for collaborators or because tooling defaults to English. Bolting on i18n later means walking every component and refactoring strings — painful.

**Decision.** Install `@nuxtjs/i18n` from Phase 0. Ship `de` (default) and `en` from day one. All user-facing strings go through translation keys with feature-prefixed dot paths (`kb.inbox.title`). Code identifiers, comments, error codes, log messages, and the spec itself stay English. Server returns error codes; the client translates.

**Consequences.**
- Slightly more work per UI string from day one, but no big-bang refactor later.
- New features must include both locale files in the same PR.
- The orchestrator is locale-agnostic — it responds in whatever language the user writes in. This is intentional: the LLM handles language naturally, no need for prompt-side translation.

**Alternatives considered.**
- German-only with i18n added later. Rejected — known to be expensive in practice, and the marginal cost of doing it right from the start is small.
- Browser-language auto-detection only without a manual switcher. Rejected — users on shared/borrowed devices need the override.

---

## ADR-013 — AI provider abstraction via Vercel AI SDK; provider-agnostic by design

**Status:** accepted

**Context.** A direct Anthropic SDK integration is the shortest path but locks the orchestrator to one vendor. Models, prices, and capabilities change frequently across vendors; the user wants flexibility without code changes per release.

**Decision.** Use the Vercel AI SDK (`ai` + `@ai-sdk/anthropic` + `@ai-sdk/openai` + `@ai-sdk/google`) as the unified interface. The SDK normalises differences in tool calls, streaming, and structured output across providers. Adding more providers is a matter of installing another `@ai-sdk/*` package and seeding a row in `ai_providers`.

**Consequences.**
- One abstraction to learn rather than three.
- Tool definitions written once, work across providers (capability flags gate which models can be picked).
- One additional dependency on the SDK's stability and API shape — acceptable: the SDK is widely adopted and Vercel maintains it actively.
- If a niche provider isn't in the SDK ecosystem, we'd need to write a custom adapter or wait. Acceptable for the listed three providers.

**Alternatives considered.**
- Direct provider SDKs (`@anthropic-ai/sdk`, `openai`, `@google/generative-ai`). Rejected — three different abstractions to maintain.
- LangChain. Rejected — heavyweight, opinionated, and historically unstable APIs; over-abstracts what we actually need.

---

## ADR-014 — Models and provider credentials live in the database, not in env vars

**Status:** accepted

**Context.** Putting `NUXT_ANTHROPIC_API_KEY` and `NUXT_ORCHESTRATOR_MODEL` in `.env` works but means: (a) every model change is a redeploy, (b) workspaces can't have separate credentials, (c) audit trails for which model ran which action require extra plumbing.

**Decision.** Store providers, models, and per-workspace credentials in the database (`ai_providers`, `ai_models`, `ai_provider_credentials`). API keys are encrypted via the same scheme as GitHub PATs (DESIGN-CRYPTO). Models are seeded but admin-editable through `/admin/ai/models`. Each conversation can pin a specific model; falls back to workspace default, then global default.

**Consequences.**
- New models become available the same day they're released — admin adds a row, picker shows it. No deploy needed.
- Multi-workspace separation: "Privat" can use Claude, "Arbeit" can use GPT, with separate billing.
- Audit log records `model_id` per tool call → cost attribution and debugging are trivial.
- Slightly more migration work and an admin UI to maintain. Worth it.
- API keys never appear in environment variables, container env, or process listings — only in the encrypted DB column. Better operationally, slightly more sensitive in the DB (mitigated by AES-256-GCM with per-org salt).

**Alternatives considered.**
- Env-var-only configuration. Rejected — incompatible with multi-workspace and per-conversation model choice.
- Hybrid (env defaults, DB overrides). Rejected — two sources of truth, confusing to debug.

---

## ADR-015 — Hub lives under `/app/**`; `/admin` stays starter-owned; `/` reserved for marketing

**Status:** accepted

**Context.** The starter uses `/admin/**` for platform-level administration (managing all users, all organisations, etc.) and that's working well. The user wants three things kept separate: (a) starter admin should remain untouched as much as possible, (b) the hub's product surface should not collide with future marketing content at `/`, (c) if the hub ever becomes a SaaS, the marketing site shouldn't have to be rebuilt to make room.

**Decision.** Three-tier routing:

- `/admin/**` — platform administration (starter-owned). The only addition from this spec is `/admin/ai/models`, which is platform-global data and naturally belongs here.
- `/app/**` — everything the hub offers to a logged-in user: KB, Todos, Projects, Orchestrator, workspace settings (incl. AI configuration, GitHub connection, orchestrator audit).
- `/` and any other top-level route — reserved. Empty for now, available for marketing pages, pricing, docs, etc.

**Consequences.**
- All new pages introduced by this spec are prefixed with `/app`. A new `app/layouts/app.vue` wraps these pages.
- The orchestrator audit log lives at `/app/settings/audit` (workspace-scoped) — not under `/admin`, because it's per-workspace data, not platform-global.
- Adding a marketing landing page later is a no-conflict drop-in at `/`.
- If users bookmark `/kb/...` (without `/app`), it 404s. Mitigated by an optional redirect rule from `/<feature>/*` → `/app/<feature>/*` if needed in practice — not part of this spec.

**Alternatives considered.**
- Hub at `/` with marketing eventually displacing it. Rejected — would require a painful URL migration if SaaS-fication happens.
- Hub at `/dashboard/**`. Rejected — `dashboard` implies a single page; `app` better signals "the application part of this site".
- Subdomain split (`app.example.com` vs `example.com`). Rejected — operationally heavier, and not needed at this scale.

---

## ADR-016 — Env vars accessed via `server/utils/config.ts`, not `useRuntimeConfig()`

**Status:** accepted

**Context.** DESIGN-ENV and T-0.3 specify "add to `nuxt.config.ts` runtimeConfig, accessible via `useRuntimeConfig()`". When T-0.3 was implemented the codebase was inspected and found to have no `runtimeConfig` block at all — every existing env var (DB, auth, email, storage) is read in `server/utils/config.ts` from `process.env` into a typed `config` object, and nothing in the repo calls `useRuntimeConfig()`.

**Decision.** Keep using the existing `server/utils/config.ts` pattern for new env vars too. Do not introduce a parallel `useRuntimeConfig()` path just for the new vars. The spec language is treated as descriptive of "the var must be typed and accessible from server code" rather than prescriptive of the Nuxt API used.

**Consequences.**
- Single, consistent config-access pattern across the codebase.
- `nuxt.config.ts` stays clean — env-var typing happens in one place (`server/utils/config.ts`'s exported `Config` type).
- Vars defined this way are server-only by default; if a future var needs to be exposed to the client (e.g. `NUXT_PUBLIC_*`), that case warrants a fresh look at whether to introduce `runtimeConfig.public` then.
- The spec text in DESIGN-ENV and T-0.3 reads slightly inaccurately for this codebase but is left unchanged so historical context is preserved; this ADR is the authoritative answer.

**Alternatives considered.**
- Strict spec compliance (add `runtimeConfig` for new vars only). Rejected — creates two coexisting patterns with no migration plan; future readers will be confused about which to use.
- Migrate everything to `useRuntimeConfig()`. Rejected for now — out of T-0.3 scope, no functional gain, and the existing pattern works for both Nitro server code and Nitro tasks (which Nuxt's runtimeConfig in scheduled tasks has historically had rough edges with). Could be revisited if a client-side need emerges.
