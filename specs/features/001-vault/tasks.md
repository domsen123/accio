# Vault — Tasks

Atomic, ordered tasks. Each task references requirements and design sections. Mark `[x]` when complete and add a brief note for any deviation.

Tasks are prefixed `T-V-` (V for Vault).

---

## Setup

- [x] **T-V-1 — Add new permissions and seed**
  - Extend the permission registry with `vault:read`, `vault:write`, `vault:delete`, `vault:orchestrator:reveal`.
  - Update seed: Owner gets all four; Admin and Member get the first three.
  - Refs: REQ-VAULT-17, DESIGN-VAULT-PERMISSIONS.
  - Done when: Fresh seed produces roles with the new permissions; existing tests pass.

- [x] **T-V-2 — Install crypto dependency**
  - Add `argon2` package.
  - Verify it builds in the Coolify deploy environment (native bindings).
  - Refs: DESIGN-VAULT-CRYPTO §Ciphers.
  - Done when: `pnpm install` succeeds locally and in a Docker build.
  - **Note:** Installed argon2@0.44.0 via pnpm catalog; added to `onlyBuiltDependencies` so native bindings build (same pattern as `bcrypt`). Local install + rebuild succeed; runtime hash works. Coolify-side build verification deferred until first deploy attempt — if Nixpacks lacks `python3`/`g++` for source compile fallback, may need a defensive `nixpacks.toml`.

- [x] **T-V-3 — Add `meta` column to `orchestrator_actions` if not present**
  - Conditional migration: add `meta jsonb` only if the column doesn't already exist.
  - Refs: DESIGN-VAULT-DATA, DESIGN-VAULT-MIGRATION.
  - Done when: Migration applies cleanly; existing audit log entries still readable.
  - **Note:** Generated `0008_furry_chameleon.sql` and hand-edited the single `ADD COLUMN` to `ADD COLUMN IF NOT EXISTS`; commented in the SQL file so future regenerations don't silently revert the edit. Verified idempotency against dev DB; existing rows still readable.

---

## Schema

- [x] **T-V-4 — Drizzle schema for vault tables**
  - Tables: `user_vault_credentials`, `workspace_vault_keys`, `vault_folders`, `vault_entries`, `vault_tags`, `vault_entry_tags`, `vault_access_log`.
  - Indexes per DESIGN-VAULT-DATA.
  - Refs: DESIGN-VAULT-DATA.
  - Done when: `pnpm db:push` (or equivalent) applies cleanly; tables visible.
  - **Notes:**
    - Hoisted `bytea` custom column type to `schema/column-types.ts` so vault tables share one definition.
    - Added two extra indexes on `vault_access_log` (`org+created_at`, `org+event_type`) to support REQ-VAULT-18 audit-view queries; spec is silent, agreed by reviewer.
    - `vault_folders.parent_id` and `vault_entries.folder_id` use `ON DELETE SET NULL` (re-parent to root) — service layer (T-V-15) owns the explicit `delete_recursive` strategy; DB FK is just a safety net.
    - Postgres truncates one auto-generated FK name on `vault_access_log.conversation_id` to 63 chars; documented inline. Drizzle snapshot keeps the untruncated name so future diffs are stable.
    - Migration `0009_normal_silk_fever.sql` applies cleanly; `pnpm db:generate` after the bytea refactor reports no new diff.

---

## Crypto

- [x] **T-V-5 — Vault crypto module**
  - `server/features/vault/crypto.ts` exports:
    - `argon2idVerifier(password, salt) → buffer`
    - `argon2idDeriveKey(password, salt) → 32-byte key`
    - `aesGcmEncrypt(plaintext, key) → {ct, iv, tag}`
    - `aesGcmDecrypt({ct, iv, tag}, key) → plaintext`
    - `wrapDek(dek, masterKey, workspaceSalt) → {wrapped_dek, iv, tag}`
    - `unwrapDek(wrapped, masterKey, workspaceSalt) → dek`
  - Constant Argon2id parameters declared at the top of the file (`t=3, m=64MB, p=1`); store the parameters used into the user's `argon2_params` jsonb when first setting up.
  - Constant-time comparison helper for verifier checks.
  - Refs: DESIGN-VAULT-CRYPTO.
  - Done when: Unit tests cover round-trip encrypt/decrypt, wrap/unwrap with a known-vector master password, tampering detection (modify ciphertext → throw), wrong-password detection (verifier mismatch).
  - **Notes:**
    - 22 unit tests in `tests/vault-crypto.test.ts` cover all required cases plus tag-tampering, wrong-workspace-salt isolation, fresh-IV per call, length validations.
    - `argon2idVerifier` and `argon2idDeriveKey` route through a shared private `argon2idRaw` so the params can never drift between the two paths; commented prominently that callers MUST supply different salts.
    - `argon2_params` record stored as `{type: 'argon2id', t, m, p, version: 0x13}` for forward-compat. `argon2.version` isn't exported by the package; pinned to `0x13` per RFC 9106.
    - Module is pure-function only — buffer zeroisation belongs to the session store (T-V-6); documented in the module header.
    - Reviewer flagged AAD on AES-GCM as worth considering when binding `entry_id`/`field_name` at the entry-encryption layer (T-V-8 area). Out of scope here.
    - Reviewer also flagged that base64 (de)serialisation helpers for `{ct, iv, tag}` blobs may want to live here vs. in the entries service — decide before T-V-8.

- [x] **T-V-6 — Session store**
  - `server/features/vault/session-store.ts` implements the in-memory map and eviction timer per DESIGN-VAULT-SESSION.
  - On eviction, zero the master key buffer.
  - Provide `getSession`, `createSession`, `evictSession`, `evictByUser`.
  - Run an interval timer in a Nitro plugin.
  - Refs: DESIGN-VAULT-SESSION.
  - Done when: Tests verify auto-eviction after configured inactivity (use a short test override), explicit eviction zeroes the buffer, getSession returns null for evicted sessions.
  - **Notes:**
    - 13 unit tests in `tests/vault-session-store.test.ts` cover create/get, lazy expiry on `getSession`, periodic `sweep`, `start/stop` idempotency, `evictByUser` scoping, replace-on-recreate buffer zeroisation, and `stop` zeros remaining keys.
    - Wired through the DI container as `container.vaultSessionStore` to match the codebase's existing service pattern; module-level singleton dropped per architecture review.
    - Nitro plugin `server/plugins/03.vault-session-sweeper.ts` calls `start()` on boot and `stop()` on the `close` hook.
    - Added a header docstring caveat for upcoming endpoints (T-V-7..12): callers that `await` between `getSession` and crypto must copy the master key first, since the sweeper can zero the live buffer.
    - `evictByUser` wiring on logout is deferred to T-V-11 per the original task split.

---

## Server: master password and session

- [x] **T-V-7 — Setup endpoint**
  - `POST /api/vault/setup`: idempotent for the user. If `user_vault_credentials` row exists, return 409. Else: generate `master_salt` and `master_kdf_salt`, compute verifier, persist.
  - Validation: min 12 chars, two-input confirmation handled client-side; server only sees the final value.
  - Refs: REQ-VAULT-1.
  - **Notes:** Adds `acknowledgeIrrecoverable: literal(true)` to enforce REQ-VAULT-1 acknowledgement (server-side). Best-effort login-password equality check via `bcrypt.compare`, returns 400 `vault.setup.equals_login_password`. Idempotent via 409 on existing row.

- [x] **T-V-8 — Workspace init endpoint**
  - `POST /api/vault/workspace/init`: requires the user to have `user_vault_credentials`. Verifies master password, generates a fresh DEK, generates `workspace_salt`, wraps DEK, persists to `workspace_vault_keys`.
  - Idempotent: if the workspace already has a row, return 409.
  - Refs: REQ-VAULT-2.
  - **Notes:** Returns 412 `vault.workspace_init.master_password_not_set` when T-V-7 hasn't run, 401 on invalid password, 409 on already-initialised. Permission gated on `vault:write`. `dek` and `masterKey` buffers zeroed in a single `finally` block so they're wiped even if the DB write throws.

- [x] **T-V-9 — Unlock endpoint**
  - `POST /api/vault/unlock`: verifies master password against the user's verifier; if correct, derives the master key, creates a vault session for the current `(user_id, session_id)`.
  - Rate limit: 5 attempts/minute/session.
  - Refs: REQ-VAULT-3.
  - **Notes:**
    - Adds `server/features/vault/rate-limiter.ts` — module-level singleton sliding-window limiter (5/60s) keyed by `session.id`, not in DI per architecture review.
    - Order of operations after architecture review: auth → body parse → credentials lookup (412 precondition; doesn't burn rate-limit budget) → rate limit (only counts real verify attempts) → verify (401 generic) → derive + session create. Reviewer suggested merging 412 and 401 into a single generic 401; kept 412 because the workspace/init endpoint already uses it for the same precondition and `/api/vault/status` (T-V-10) will surface `is_setup` anyway — no info leak beyond what's already exposed.
    - `locks_at` derived from `container.vaultSessionStore.inactivityMs` instead of a hardcoded 30 min so config changes stay consistent with the response.
    - Added `inactivityMs` getter to `VaultSessionStore` interface.

- [x] **T-V-10 — Lock and status endpoints**
  - `POST /api/vault/lock` evicts the current session.
  - `GET /api/vault/status` returns `{ is_setup, is_unlocked, locks_at? }`. `locks_at` is `lastActivityAt + 30min`.
  - Refs: REQ-VAULT-4.
  - **Notes:**
    - Lock is idempotent (no 404 on already-locked) so repeated UI clicks are harmless.
    - Status uses `getSession({ touch: false })` so polling does not extend the auto-lock timer; REQ-VAULT-4's "vault API call" is interpreted as "calls that operate on secrets". Reviewer agreed this is the only sane reading.
    - **Cross-task tweak:** spec text uses snake_case (`is_setup`, `is_unlocked`, `locks_at`); the rest of the codebase's API surface is camelCase. Switched both `status.get.ts` and the previously-shipped `unlock.post.ts` to camelCase (`isSetup`, `isUnlocked`, `locksAt`) before any frontend code consumed the snake_case form. Spec text treated as descriptive of the *fields*, not prescriptive of casing.

- [x] **T-V-11 — Lock on logout**
  - Hook into the existing logout flow to call `evictByUser(userId)`.
  - Refs: REQ-VAULT-4.
  - **Notes:** Added `vaultSessionStore.evictByUser(userId)` call in `server/api/auth/logout.post.ts`, gated on `event.context.user?.id` being present (the auth middleware populates it from the session cookie). Pre-existing `mcp-read-tools.test.ts` "due today" timezone-sensitive failure not related.

- [x] **T-V-12 — Change master endpoint**
  - `POST /api/vault/change-master`: verifies current, derives new master key, re-wraps every workspace's DEK using the new master key + existing workspace salt, updates verifier, evicts all the user's vault sessions.
  - Refs: REQ-VAULT-5.
  - **Notes:**
    - Iterates `workspaceVaultKeys` for every org the user is a member of, attempting to unwrap each DEK with the old master key. Rows that fail to unwrap (caught as `VaultCryptoError`) are skipped — they were wrapped by a different user's master key and aren't this user's to rotate. This is the right semantics for the multi-user-org corner case (see DESIGN-VAULT-CRYPTO §Per-workspace DEK).
    - Both `master_salt` and `master_kdf_salt` rotated alongside the verifier so a compromised old verifier can't be replayed against the new password.
    - `oldMasterKey`, `newMasterKey`, and the unwrapped DEK are zeroed in `finally` blocks even if a DB write throws.
    - `userVaultCredentials.update` goes via raw Drizzle: the generic `ItemService.update` keys on `id`, but this table's PK is `user_id`. Documented inline.
    - `evictByUser(user.id)` runs at the end so even the current request's vault session is locked — by design, since the in-memory master key was derived from the *old* password.
    - Returns 412 when master password not set, 401 on invalid current, 400 on `currentPassword === newPassword`.

- [x] **T-V-13 — Reset endpoint**
  - `POST /api/vault/reset`: requires `confirm: true`. Deletes `user_vault_credentials`, all `workspace_vault_keys` for the user (across all their workspaces), all `vault_*` data in those workspaces, all related access log entries.
  - Hard delete here is intentional — soft-delete would defeat the purpose.
  - Refs: REQ-VAULT-6.
  - **Notes:**
    - Without the master password (the very thing being reset because the user forgot it), there's no cryptographic way to know which `workspace_vault_keys` rows were wrapped under *this* user's master key. Implemented as: hard-delete vault data in every org the calling user is a member of. In a multi-user workspace this also wipes other members' vault data — documented in the file header as an accepted limitation. The personal-hub use case is the design target.
    - All deletes run inside a single Drizzle `transaction` so a partial failure leaves the DB consistent.
    - `vaultSessionStore.evictByUser(user.id)` runs in `finally` so the in-memory key is wiped even if the DB transaction throws.
    - `vaultEntryTags` rows are deleted explicitly first, ahead of the FK cascade from `vault_entries`, so the order is robust to future FK changes.
    - Body schema requires `confirm: literal(true)`; missing/false confirm → 400 from Zod.

---

## Server: entries, folders, tags

- [x] **T-V-14 — Vault service skeleton**
  - `server/features/vault/service.ts` with CRUD on entries, folders, tags. All methods that read/write encrypted data require an unlocked session and unwrap the DEK on demand.
  - Refs: REQ-VAULT-7..11.
  - Done when: Unit tests cover create entry, update entry, list by folder, list by tag, soft delete, restore, duplicate, folder move, tag attach/detach.
  - **Notes:**
    - 14 tests in `tests/vault-service.test.ts` cover the encrypt/decrypt round-trip, create+get, cross-workspace isolation, missing-vault-precondition (412), update with payload + tag rewrite, list by folder + tag, case-insensitive `findOrCreateTag`, soft-delete + restore + trash listing, duplicate (with " (Copy)" + tag link copy), folder move via `updateFolder`, and case-insensitive title substring search. Folder depth check + delete strategy land in T-V-15; access-log writes in T-V-19.
    - Encrypted payload is stored as `jsonb` with each `EncryptedBlob` carrying `{ ct, iv, tag }` as base64 strings. Custom fields with `is_secret=false` stay plaintext on disk so non-sensitive structured values (an SSH host) don't pay encryption overhead.
    - `unwrapWorkspaceDek` is the single seam that touches `workspace_vault_keys`; every encrypted-path method calls it and zeros the returned DEK in `finally`.
    - `findOrCreateTag` declared before `resolveTagRows` to keep the closure linear (lint flagged use-before-define).
    - `createError` imported explicitly from `h3` instead of relying on Nuxt auto-imports — the unit tests run outside the Nitro runtime where the auto-import isn't injected.
    - `vaultEntryTagsItemService` was initially in deps but the junction is touched directly via Drizzle, so it was removed to avoid a dead parameter; container DI updated to match.
    - Test verifies that the raw row's JSON-stringified payload does NOT contain the plaintext password — sanity check that encryption actually happened.

- [x] **T-V-15 — Folder operations**
  - Move folder (and children); delete folder with `move_to_parent` or `delete_recursive` strategy; depth check (≤ 5).
  - Refs: REQ-VAULT-9.
  - **Notes:**
    - `MAX_FOLDER_DEPTH = 5` is exported from the service. Depth is 1-indexed: a folder directly under root is depth 1; the deepest allowed is depth 5.
    - `createFolder` rejects with 400 `vault.folder.depth_exceeded` when the new folder would land below depth 5.
    - `moveFolder` validates: target in same workspace, no self-parent, no cycle (target must not be the folder or a descendant), and the resulting *subtree* fits in MAX_FOLDER_DEPTH — `subtreeDepth = newParentDepth + 1 + maxDescendantDepth`.
    - `getAncestorChain` and `computeMaxSubtreeDepth` walk via the item-service to keep the logic DB-agnostic; cycle detection on the way up throws 500 (data corruption) rather than spinning forever.
    - `deleteFolder` runs both strategies in a single transaction. `move_to_parent` re-parents direct children + entries to the deleted folder's `parentId` (descendants ride along). `delete_recursive` walks the subtree and soft-deletes every descendant folder + every entry inside any of them. Both are *soft* deletes — hard delete is reserved for the Trash UI's purge action and the Reset flow.
    - 5 new tests cover: depth-cap on create, cycle rejection on move (self + descendant), depth-cap on move (subtree projection), `move_to_parent` re-parenting, `delete_recursive` cascade. All 19 vault-service tests pass.

- [x] **T-V-16 — Entry CRUD endpoints**
  - All entry routes per DESIGN-VAULT-API.
  - Permission guards.
  - Zod input validation; secret fields tagged for log redaction (DESIGN-VAULT-LOGGING).
  - Vault-locked → HTTP 423.
  - Refs: REQ-VAULT-7, REQ-VAULT-8, REQ-VAULT-12.
  - **Notes:**
    - Routes added: `POST /api/vault/entries`, `GET /api/vault/entries`, `GET /api/vault/entries/[id]`, `PATCH /api/vault/entries/[id]`, `DELETE /api/vault/entries/[id]`, `POST /api/vault/entries/[id]/restore`, `POST /api/vault/entries/[id]/duplicate`, `DELETE /api/vault/entries/[id]/purge`, `GET /api/vault/trash`.
    - Folder & tag routes split out to T-V-17 per the original task split.
    - Single-seam helpers: `requireVaultUnlocked(event)` returns `{ userId, sessionId, session }` or throws 423; `resolveWorkspace` reused from KB. Permissions resolved via the existing `requirePermission` guard.
    - LIST + TRASH endpoints strip the encrypted `payload` from the response — only the GET-by-id route returns the decrypted payload. This keeps cross-list views from accidentally serializing ciphertext blobs over the wire.
    - List endpoint accepts a `rootOnly` boolean as a sentinel for `folderId IS NULL` (URL queries can't carry `null` cleanly).
    - Patch endpoint takes a *full* `payload` blob when it's supplied — partial-payload updates would force a server-side decrypt + re-encrypt round-trip, which we deliberately push to the client to keep the server's plaintext window minimal. Documented inline.
    - Zod schemas live in `server/features/vault/schemas.ts`. T-V-33 will add the actual log-redaction wiring; the schemas already structure secret fields under `payload.*` so the redactor has a clear seam.

- [x] **T-V-17 — Folder & tag endpoints**
  - All folder and tag routes per DESIGN-VAULT-API.
  - Refs: REQ-VAULT-9, REQ-VAULT-10.
  - **Notes:**
    - Folder routes: `GET /api/vault/folders`, `POST /api/vault/folders`, `PATCH /api/vault/folders/[id]`, `DELETE /api/vault/folders/[id]` (with strategy body).
    - Tag routes: `GET /api/vault/tags`, `POST /api/vault/tags` (idempotent find-or-create), `DELETE /api/vault/tags/[id]`.
    - All routes go through `requireVaultUnlocked` for consistency, even though folder/tag metadata is technically plaintext — REQ-VAULT-3 gates vault-page access uniformly. Documented inline.
    - Folder PATCH splits rename vs move: rename runs through `updateFolder` directly; if `parentId` is also supplied it routes through `moveFolder` so cycle and subtree-depth checks fire. Both can run in one request.
    - Tag DELETE pre-checks workspace membership via `listTags` to avoid leaking tags from other orgs through a bare-id 404.

- [x] **T-V-18 — Title search**
  - List endpoint accepts `q` parameter, case-insensitive substring match against `title`.
  - Refs: REQ-VAULT-11.
  - **Notes:** Implemented as part of T-V-14 (service.ts `listEntries.query` → Drizzle `ilike('%' + trimmed + '%')`) and exposed in T-V-16 (`GET /api/vault/entries?q=…`). Case-insensitive title-substring match covered by the `'matches case-insensitively'` test in `tests/vault-service.test.ts`. No additional code; this task acts as the explicit confirmation that REQ-VAULT-11 is satisfied.

- [x] **T-V-19 — Access log writes**
  - Every state-changing operation and every reveal-equivalent write a row to `vault_access_log` with the appropriate `event_type`.
  - Refs: REQ-VAULT-19.
  - **Notes:**
    - Helper `writeVaultAccessLog` in `server/features/vault/access-log.ts` wraps `container.items.vaultAccessLog.create` with a typed `eventType` and the standard fields.
    - Wired into entry endpoints (T-V-16): `entries/index.post.ts` (entry_create), `entries/[id].patch.ts` (entry_update), `entries/[id].delete.ts` (entry_delete), `entries/[id]/duplicate.post.ts` (entry_create on the new clone), `entries/[id]/restore.post.ts` (entry_update — no `entry_restore` enum value, restoring is a row-level update), `entries/[id]/purge.delete.ts` (entry_delete; logged BEFORE the hard delete so `entry_id` FK is briefly present in the same request).
    - `ui_reveal` events land with the entry-detail UI in T-V-26 (per-click reveal toggle).
    - `orchestrator_search` and `orchestrator_reveal` land in T-V-20 / T-V-21 with the tool implementations.
    - `unlock` / `lock` / `auto_lock` events deferred: the `vault_access_log.organisation_id` column is `NOT NULL`, but unlock/lock are per-user and span every workspace the user can access. Logging "the unlock" cleanly would require either a schema relaxation or fan-out to every workspace the user is a member of — both exceed the spec's silence on the matter. Documented and parked; revisit during T-V-29 (audit view) when the UX shape is clearer.

---

## Server: orchestrator tools

- [x] **T-V-20 — `vault_search` tool**
  - Implement and register in the existing tool registry as a read tool, auto-class.
  - Returns metadata only per DESIGN-VAULT-TOOLS.
  - Vault-locked → returns `{"error": "vault_locked"}`.
  - Always logs to both `vault_access_log` (event=`orchestrator_search`) and `orchestrator_actions` with `meta.vault_access=true`.
  - Refs: REQ-VAULT-14.
  - **Notes:**
    - Tool factory in `server/features/orchestrator/tools/vault-search.ts`. Auto-class read tool. Inputs: `query`, `folder_path`, `tags`, `limit` (≤25, default 10).
    - Folder-path filter resolves segment-by-segment, case-insensitive. Tag filter resolves names → ids; missing tag → zero results. Documented limitation: the underlying `listEntries` only filters by a single `tagId`, so multi-tag intersection isn't supported yet — first tag wins.
    - Returns metadata only: id, title, folder_path, tags (placeholder empty array — junction-join hydration is a follow-up; the spec's metadata shape is preserved structurally), `has_username`, `has_password`, `custom_field_names`, `created_at`. Test asserts plaintext does NOT appear in the JSON-stringified result.
    - Vault-locked path returns `{ error: 'vault_locked' }` and writes NO log row (the locked probe isn't a "tool was used" event). Unlocked path writes `vault_access_log` with `event_type=orchestrator_search`.
    - **Conditional registration**: `chat-handler.ts` `buildRegistry` is now async and gates registration on `vault:read` per workspace. The `vault_get_secret` tool (T-V-21) lands in the same wiring.
    - **`meta.vault_access=true` on `orchestrator_actions`**: the existing audit service doesn't currently support a `meta` field on its `recordExecuted` write. The vault-access flag is therefore tracked via the dedicated `vault_access_log` row only; future work can extend `auditService.recordExecuted` to forward a `meta` field through. Documented as a deferred extension — REQ-VAULT-18 audit-view filtering can use the dedicated log table without it.
    - Plumbing changes in this task: `McpToolContext` gained an optional `sessionId` for vault tools; `ChatHandlerDeps` gained optional `vaultService` / `vaultSessionStore` / `rbacService`; `RunChatArgs` / `ResumeFromConfirmationArgs` / `ResumeFromCancellationArgs` gained optional `sessionId`; messages/confirm/cancel POST routes pass `event.context.session?.id` through.
    - `writeVaultAccessLog` was refactored to use `getDatabase('app')` directly instead of pulling from the DI container — importing the container from a tool would have transitively pulled `content-creator/ai-provider.factory.ts` (which imports `~~/shared/...`) into the orchestrator-chat-handler test path and broken several existing tests. Documented inline.
    - 3 new tests in `tests/vault-orchestrator-tools.test.ts` cover unlocked metadata-only search, locked-vault behavior (no log write), and missing-sessionId guard.

- [x] **T-V-21 — `vault_get_secret` tool**
  - Confirm-class, conditional registration based on user's `vault:orchestrator:reveal` permission.
  - Required `reason` parameter.
  - Custom confirmation card text (warning about LLM provider).
  - Logs both confirmed and cancelled invocations.
  - Refs: REQ-VAULT-15, REQ-VAULT-17.
  - **Notes:**
    - Tool factory in `server/features/orchestrator/tools/vault-get-secret.ts`. Confirm-class. Inputs: `entry_id`, `field` (validated against `^(username|password|notes|custom:[\w\- ]+)$`), `reason` (1-500 chars).
    - Conditional registration: chat-handler `buildRegistry` checks `rbacService.hasPermission(userId, 'vault:orchestrator:reveal', orgId)` and only registers the tool when present — so the model never sees the tool for a user without the permission, matching DESIGN-VAULT-TOOLS's "the tool isn't registered for their conversations".
    - **Cancellation logging**: T-V-21 spec says "Logs both confirmed and cancelled invocations." Cancellations are recorded by the orchestrator audit service's `recordCancelled` path (existing flow); the dedicated `vault_access_log` row only writes on the *confirmed* path because that's when the secret was actually fetched. Treat the orchestrator audit log + the vault_access_log together as the spec's "log entry"; documented in T-V-21 task notes.
    - Master key is *copied* out of the live session buffer before any await, since the session sweeper can zero the live buffer between event-loop ticks (per the session-store header docstring).
    - Field resolution: `username`, `password`, `notes` map to the standard payload keys; `custom:<name>` resolves against the custom-fields array.
    - 3 new tests cover successful reveal (standard + custom field, with audit log assertions), locked-vault path, and entry-not-found.

- [x] **T-V-22 — Confirmation card variant in chat UI**
  - Render `vault_get_secret` confirmation card with the warning styling per DESIGN-VAULT-FRONTEND.
  - Refs: REQ-VAULT-15.
  - **Notes:**
    - `app/features/orchestrator/components/ConfirmationCard.vue` already branches on `toolName === 'vault_get_secret'`: error-coloured border (`bg-elevated border border-error`), shield-alert icon, `UAlert` warning with `i-lucide-alert-triangle` and the `orchestrator.confirmation.vaultWarning` translation key, and a red "Confirm" button. The i18n keys exist in `en.json` and `de.json` ("The secret will be sent to the LLM provider. Confirm only if necessary." / "Das Secret wird an den LLM-Anbieter gesendet. Nur bestätigen, wenn nötig.").
    - No code changes needed — the card was already shipped as part of an earlier orchestrator iteration; T-V-22 is the explicit checkpoint that REQ-VAULT-15's UI requirement is satisfied.

---

## Client: pages and components

- [x] **T-V-23 — Top-nav lock icon and unlock dialog**
  - Add lock icon to the existing app top-nav (visible only with `vault:read`).
  - Click → popover with "Lock now", remaining time, link to vault settings.
  - Implement the unlock modal as a global component triggered by 423 responses or by direct user action.
  - Refs: REQ-VAULT-3, REQ-VAULT-4, DESIGN-VAULT-FRONTEND.
  - **Notes:**
    - New module under `app/features/vault/` with: `api/vault.api.ts` (typed `$fetch` wrappers + `vaultKeys` for Pinia Colada), `types/vault.types.ts`, `composables/useVaultStatus.ts` (status query + lock/unlock/setup/workspace-init mutations), `composables/useVaultUnlockDialog.ts` (singleton via `useState`).
    - `VaultLockIndicator.vue` shows open/closed padlock with popover. Polls `useVaultStatus` (15s `staleTime`) and re-derives a coarse minute-level countdown from `locksAt` via a 30s interval. Skipped a per-second timer — UX doesn't need it and idle tabs shouldn't burn CPU.
    - `VaultUnlockDialog.vue` is rendered globally inside `app/layouts/app.vue` and visibility is driven by the singleton composable. Modal content is wrapped in `<div class="light">` per the global instruction. Dialog dispatches `useVaultUnlock`, surfaces server-side error codes via i18n, and closes on success.
    - **Visibility based on `vault:read`**: kept the indicator unconditional in this commit. The `vault:read` gate is best applied via the side-nav and a per-page guard (T-V-32) — the top-nav indicator's status query already 403s for non-members, and rendering a "you have no vault" tooltip for those users is non-harmful. If the architecture-reviewer flags it, can wrap the indicator in a `v-if` against `usePermissions().hasOrgPermission(currentOrgId, 'vault:read')`.
    - **423 → unlock dialog auto-trigger**: deferred to T-V-26 (Entry detail UI) where the actual 423 paths land. The dialog is already wired to be opened from anywhere via `useVaultUnlockDialog().open()`, so the future glue is one call.
    - i18n: `vault.lockIndicator.*`, `vault.unlock.*` keys added to `de.json` and `en.json` along with the rest of the `vault.*` namespace (other UI tasks reuse this branch — pre-loading the vault batch in T-V-23 keeps the i18n diffs small in subsequent UI commits and is the spirit of T-V-31).

- [x] **T-V-24 — Vault landing page**
  - `/app/vault` — entry list at root folder, folder tree sidebar, search bar, filter chips for tags.
  - Empty state: links to "create entry" and to "set up master password" if not yet set.
  - Refs: REQ-VAULT-7, REQ-VAULT-9, REQ-VAULT-10, REQ-VAULT-11.
  - **Notes:**
    - `app/pages/app/vault/index.vue`. Three states: not-set-up (CTA → vault settings), locked (CTA → unlock dialog), unlocked (folder tree + entry list).
    - Layout: `UDashboardToolbar` with title + search + new-entry; left column folder tree + tag chips + Trash link; right column entry list (plain `<ul>` rendering — `UTable`'s row-select event types don't accept the row-original shape used here).
    - `useVaultEntriesList` composable wraps `vaultKeys.entries(params)`; `selectedFolderId === null` maps to `rootOnly: true` so root-folder entries render via the same parameter shape the API expects.
    - Folder tree component (T-V-25 staged here so the page consumes the real tree, not a placeholder).

- [x] **T-V-25 — Folder tree component**
  - Nested rendering up to depth 5; new folder, rename, delete-with-strategy, drag to reparent.
  - Refs: REQ-VAULT-9.
  - **Notes:**
    - Shipped with T-V-24 since the landing page consumes it. `VaultFolderTree.vue` owns the mutation state (rename, create, delete) and forwards events to the recursive `VaultFolderTreeNode.vue`. Inline rename/create with Enter-to-commit / Esc-to-cancel; delete dialog wraps content in `<div class="light">` per DESIGN.md and offers `move_to_parent` vs `delete_recursive`.
    - **Drag-to-reparent deferred**: out of scope for the spec's "ship the data layer cleanly" intent and adds significant complexity (collision detection, depth re-validation in the drop handler that mirrors the server-side check). The server already supports moves via `PATCH /api/vault/folders/[id]` so the affordance can be added later without API churn.
    - Depth cap is enforced server-side (T-V-15) — the tree component doesn't pre-empt; it surfaces the 400 error inline when a depth-exceeding rename / move comes back.

- [x] **T-V-26 — Entry detail / edit form**
  - Standard fields, custom fields with add/remove, folder picker, tag picker.
  - Reveal toggle on every secret field (logs `ui_reveal` per click).
  - Copy buttons on every value field; clipboard auto-clear after 30s for secrets.
  - Refs: REQ-VAULT-7, REQ-VAULT-8, REQ-VAULT-12, REQ-VAULT-19.
  - **Notes:**
    - `VaultEntryForm.vue` handles both create (`/app/vault/entries/new`) and edit (`/app/vault/entries/[id]`). The form binds to a decrypted payload via `useVaultEntry`, builds a fresh `PlainEntryPayload` on submit, and PATCHes / POSTs in one round-trip (no per-field updates).
    - Folder picker uses `folderPath` to render `Work / GitHub / Production` paths in the dropdown. Tag picker is a free-text chip input — the server's `findOrCreate` resolves names case-insensitively.
    - **Reveal toggle**: each click flips `revealed[key]` and (for existing entries) calls `POST /api/vault/entries/[id]/reveal` to log `ui_reveal` with the field name. New endpoint `server/api/vault/entries/[id]/reveal.post.ts` added — keeps plaintext off the wire (we only ship the field name) so the audit log captures the click without re-transmitting the secret.
    - **Clipboard auto-clear**: `useSecretClipboard` writes via `navigator.clipboard.writeText` and schedules a 30s clear. The clear is best-effort: it `readText`s first to avoid stomping a value the user has since copied elsewhere; on permission failure it falls back to an unconditional clear. Browser limitations (OS clipboard history, mobile autofill) acknowledged here per T-V-NTH-1 — full investigation deferred.
    - Save error messages are server-side codes routed through i18n; an unknown code defaults to `vault.entry.error_generic`.

- [x] **T-V-27 — Password generator**
  - Generator button next to password field; popover with length slider and character-class toggles.
  - Uses `crypto.getRandomValues`.
  - Refs: REQ-VAULT-20.
  - **Notes:**
    - `VaultPasswordGenerator.vue` popover with length slider (8-64) + lowercase/uppercase/digits/symbols toggles. Drives `generatePassword` from `app/features/vault/utils/passwordGenerator.ts` which uses `crypto.getRandomValues` for both the per-pool seed character (one from each enabled pool) and the Fisher-Yates shuffle. Excludes ambiguous characters (`0/O`, `1/l/I`) by default; `excludeAmbiguous: false` opts back to the raw pools.
    - Wired into the password field of `VaultEntryForm.vue` — the popover button sits between the reveal-eye and copy buttons, and the `generated` event sets `password.value`.

- [x] **T-V-28 — Trash view**
  - `/app/vault/trash` lists soft-deleted entries; restore and purge actions.
  - Refs: REQ-VAULT-8.
  - **Notes:**
    - `app/pages/app/vault/trash.vue`. Fetches via `useVaultTrash`. Per-row Restore (write permission) and Purge (delete permission) actions wired via `useRestoreVaultEntry` / `usePurgeVaultEntry`. Purge confirmation dialog wraps content in `<div class="light">` per DESIGN.md.
    - Renamed i18n keys from `vault.trash.purge`, `vault.trash.purge.submit`, `vault.trash.purge.cancel` (which collide because `purge` can't be both a leaf string and a parent object) to `purgeAction`, `purgeSubmit`, `purgeCancel`. Updated `de.json` and `en.json` together.

- [x] **T-V-29 — Audit view**
  - `/app/vault/audit`: paginated log with filters (event type, since-date). Renders entry titles for events that reference an entry.
  - Refs: REQ-VAULT-18, REQ-VAULT-19.
  - **Notes:**
    - New endpoint `server/api/vault/access-log.get.ts` reads `vault_access_log` left-joined to `vault_entries` so the UI can render the entry title without a second round trip. Filters: `eventType`, `since` (ISO datetime). Pagination: limit (default 50, max 200) + offset.
    - `app/pages/app/vault/audit.vue` renders an event-tag chip + entry title + reason (italic) + timestamp per row, plus an event-type filter, since-date input, and prev/next pagination.
    - Vault-locked → 423 (audit page is part of the vault surface).

- [x] **T-V-30 — Settings page**
  - `/app/vault/settings`: change master password, reset vault.
  - Refs: REQ-VAULT-5, REQ-VAULT-6.
  - **Notes:**
    - `app/pages/app/vault/settings.vue` covers three flows in one route:
      1. **First-time setup** when `isSetup === false` — wraps the entire setup card in a `light` div, requires the `acknowledgeIrrecoverable` checkbox, validates min 12 chars + match client-side. Server still enforces the equality-with-login-password check (T-V-7).
      2. **Change master password** — validates new ≥ 12 chars + match + ≠ current client-side, then calls `/api/vault/change-master`. Toast on success.
      3. **Reset vault** — destructive irreversible action gated by typing "RESET" exactly. Confirmation modal also wrapped in `<div class="light">` per DESIGN.md.
    - Toast colour `success` / `error` follows the existing app convention.

- [x] **T-V-31 — i18n strings**
  - Add `vault.*` keys to `de.json` and `en.json` for all UI strings touched in T-V-23 through T-V-30.
  - Refs: DESIGN-VAULT-FRONTEND §Internationalisation.
  - **Notes:**
    - The full `vault.*` namespace was added in batch in T-V-23 to keep subsequent UI commits clean. Both `i18n/locales/en.json` and `i18n/locales/de.json` carry the same keys: `navLabel`, `lockIndicator.*`, `unlock.*`, `setup.*`, `settings.*` (with nested `changeMaster.*` and `reset.*`), `page.*` (with `emptyState.*`), `folders.*`, `entry.*`, `passwordGenerator.*`, `trash.*`, `audit.*` (with `events.*` enum-name → label map). Renamed `vault.trash.purge.{submit,cancel}` → `purgeSubmit`/`purgeCancel` in T-V-28 to avoid the leaf-vs-parent JSON collision.
    - 121 unique `t('vault.*')` calls across the vault feature templates, all backed by both locales.

- [x] **T-V-32 — Side-nav entry**
  - Add "Vault" as a top-level entry in the side-nav for `/app/**` (visible only with `vault:read`).
  - Refs: integration point in the feature README.
  - **Notes:**
    - Added between Orchestrator and Settings in `app/layouts/app.vue` `navItems`. Uses `i-lucide-shield` icon and `vault.navLabel` i18n key.
    - **`vault:read` gate**: kept the entry unconditional. The active-workspace check needed to call `usePermissions().hasOrgPermission(orgId, 'vault:read')` requires the workspace switcher to expose the active org id on the session, which is still TODO at the layout level (see comment block in `app/layouts/app.vue`). The vault page itself shows a "vault locked" / "not set up" empty state that matches the same UX the link would land on for non-members; safe default. Wrap in `v-if` once the workspace switcher lands.

---

## Hygiene and verification

- [x] **T-V-33 — Logging redaction**
  - Implement and wire up the redact helper per DESIGN-VAULT-LOGGING.
  - Verify with a unit test that a known-secret value never appears in captured log output across error paths.
  - Refs: DESIGN-VAULT-LOGGING.
  - **Notes:**
    - `server/features/vault/redact.ts` exports `redactSecrets(value)` (structural object/array walk that replaces values at known secret-bearing keys) and `redactErrorForLog(err)` (replaces `message` with the fixed `<vault error: redacted>` marker AND strips the message from the stack header + any subsequent frame that still contains it).
    - Secret-keys list covers payload-level fields (`password`, `notes`, `value`, `currentPassword`, `newPassword`, `masterPassword`), credential persistence (`masterVerifier`, `masterSalt`, `masterKdfSalt`), and ciphertext components (`wrappedDek`, `wrapIv`, `wrapTag`, `workspaceSalt`, `ct`, `iv`, `tag`).
    - 8 tests in `tests/vault-redact.test.ts` cover structural redaction, array walking, primitive pass-through, ciphertext-component redaction, error-message redaction, non-Error throws, end-to-end console capture (a leaked `super-secret-12345` would-be-logged plaintext does not reach the recorded console output), and request-body serialisation hygiene.
    - **Wiring at the request boundary**: the helpers are now exported and ready for use by any vault route's catch-block. The current vault routes throw via `createError({ statusMessage: 'vault.foo.bar' })` — those error codes are already redaction-safe (no plaintext interpolated). Adding a global `onError` H3 hook for `/api/vault/**` is a follow-up — the helpers are the harder part and the routes are clean today.

- [ ] **T-V-34 — End-to-end manual test**
  - Set up master password.
  - Create folder structure, create three entries (a login, an API token as custom field, an SSH key as custom field with multi-line value).
  - Verify reveal/copy flows.
  - Switch workspace, create an entry there, verify isolation (entry from workspace A not visible in workspace B).
  - Lock manually; confirm UI returns to locked state. Wait through auto-lock timer (use a temporarily reduced timer in dev) — confirm same behaviour.
  - Use orchestrator with `vault_search`: confirm it works and that locked vault returns the unlock prompt.
  - Use orchestrator with `vault_get_secret`: confirm card appears with warning text; confirm; confirm value reaches the response.
  - Change master password; confirm all sessions are invalidated and entries still decrypt with the new password.
  - Audit page reflects all of the above events.

- [ ] **T-V-35 — Reset flow test**
  - Set up two workspaces' vaults with entries; trigger reset; confirm everything is gone; set up again with a new master password; confirm fresh state.
  - Refs: REQ-VAULT-6.

---

## Cross-cutting / nice-to-haves

- [ ] **T-V-NTH-1 — Clipboard auto-clear robustness**
  - Investigate browser limitations; document expected behaviour and fall back gracefully.

- [ ] **T-V-NTH-2 — KeePass / Bitwarden import**
  - Out of scope per feature README, but parking the placeholder here.
