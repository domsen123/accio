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

- [ ] **T-V-19 — Access log writes**
  - Every state-changing operation and every reveal-equivalent write a row to `vault_access_log` with the appropriate `event_type`.
  - Refs: REQ-VAULT-19.

---

## Server: orchestrator tools

- [ ] **T-V-20 — `vault_search` tool**
  - Implement and register in the existing tool registry as a read tool, auto-class.
  - Returns metadata only per DESIGN-VAULT-TOOLS.
  - Vault-locked → returns `{"error": "vault_locked"}`.
  - Always logs to both `vault_access_log` (event=`orchestrator_search`) and `orchestrator_actions` with `meta.vault_access=true`.
  - Refs: REQ-VAULT-14.

- [ ] **T-V-21 — `vault_get_secret` tool**
  - Confirm-class, conditional registration based on user's `vault:orchestrator:reveal` permission.
  - Required `reason` parameter.
  - Custom confirmation card text (warning about LLM provider).
  - Logs both confirmed and cancelled invocations.
  - Refs: REQ-VAULT-15, REQ-VAULT-17.

- [ ] **T-V-22 — Confirmation card variant in chat UI**
  - Render `vault_get_secret` confirmation card with the warning styling per DESIGN-VAULT-FRONTEND.
  - Refs: REQ-VAULT-15.

---

## Client: pages and components

- [ ] **T-V-23 — Top-nav lock icon and unlock dialog**
  - Add lock icon to the existing app top-nav (visible only with `vault:read`).
  - Click → popover with "Lock now", remaining time, link to vault settings.
  - Implement the unlock modal as a global component triggered by 423 responses or by direct user action.
  - Refs: REQ-VAULT-3, REQ-VAULT-4, DESIGN-VAULT-FRONTEND.

- [ ] **T-V-24 — Vault landing page**
  - `/app/vault` — entry list at root folder, folder tree sidebar, search bar, filter chips for tags.
  - Empty state: links to "create entry" and to "set up master password" if not yet set.
  - Refs: REQ-VAULT-7, REQ-VAULT-9, REQ-VAULT-10, REQ-VAULT-11.

- [ ] **T-V-25 — Folder tree component**
  - Nested rendering up to depth 5; new folder, rename, delete-with-strategy, drag to reparent.
  - Refs: REQ-VAULT-9.

- [ ] **T-V-26 — Entry detail / edit form**
  - Standard fields, custom fields with add/remove, folder picker, tag picker.
  - Reveal toggle on every secret field (logs `ui_reveal` per click).
  - Copy buttons on every value field; clipboard auto-clear after 30s for secrets.
  - Refs: REQ-VAULT-7, REQ-VAULT-8, REQ-VAULT-12, REQ-VAULT-19.

- [ ] **T-V-27 — Password generator**
  - Generator button next to password field; popover with length slider and character-class toggles.
  - Uses `crypto.getRandomValues`.
  - Refs: REQ-VAULT-20.

- [ ] **T-V-28 — Trash view**
  - `/app/vault/trash` lists soft-deleted entries; restore and purge actions.
  - Refs: REQ-VAULT-8.

- [ ] **T-V-29 — Audit view**
  - `/app/vault/audit`: paginated log with filters (event type, since-date). Renders entry titles for events that reference an entry.
  - Refs: REQ-VAULT-18, REQ-VAULT-19.

- [ ] **T-V-30 — Settings page**
  - `/app/vault/settings`: change master password, reset vault.
  - Refs: REQ-VAULT-5, REQ-VAULT-6.

- [ ] **T-V-31 — i18n strings**
  - Add `vault.*` keys to `de.json` and `en.json` for all UI strings touched in T-V-23 through T-V-30.
  - Refs: DESIGN-VAULT-FRONTEND §Internationalisation.

- [ ] **T-V-32 — Side-nav entry**
  - Add "Vault" as a top-level entry in the side-nav for `/app/**` (visible only with `vault:read`).
  - Refs: integration point in the feature README.

---

## Hygiene and verification

- [ ] **T-V-33 — Logging redaction**
  - Implement and wire up the redact helper per DESIGN-VAULT-LOGGING.
  - Verify with a unit test that a known-secret value never appears in captured log output across error paths.
  - Refs: DESIGN-VAULT-LOGGING.

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
