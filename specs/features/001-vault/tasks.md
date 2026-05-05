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

- [ ] **T-V-7 — Setup endpoint**
  - `POST /api/vault/setup`: idempotent for the user. If `user_vault_credentials` row exists, return 409. Else: generate `master_salt` and `master_kdf_salt`, compute verifier, persist.
  - Validation: min 12 chars, two-input confirmation handled client-side; server only sees the final value.
  - Refs: REQ-VAULT-1.

- [ ] **T-V-8 — Workspace init endpoint**
  - `POST /api/vault/workspace/init`: requires the user to have `user_vault_credentials`. Verifies master password, generates a fresh DEK, generates `workspace_salt`, wraps DEK, persists to `workspace_vault_keys`.
  - Idempotent: if the workspace already has a row, return 409.
  - Refs: REQ-VAULT-2.

- [ ] **T-V-9 — Unlock endpoint**
  - `POST /api/vault/unlock`: verifies master password against the user's verifier; if correct, derives the master key, creates a vault session for the current `(user_id, session_id)`.
  - Rate limit: 5 attempts/minute/session.
  - Refs: REQ-VAULT-3.

- [ ] **T-V-10 — Lock and status endpoints**
  - `POST /api/vault/lock` evicts the current session.
  - `GET /api/vault/status` returns `{ is_setup, is_unlocked, locks_at? }`. `locks_at` is `lastActivityAt + 30min`.
  - Refs: REQ-VAULT-4.

- [ ] **T-V-11 — Lock on logout**
  - Hook into the existing logout flow to call `evictByUser(userId)`.
  - Refs: REQ-VAULT-4.

- [ ] **T-V-12 — Change master endpoint**
  - `POST /api/vault/change-master`: verifies current, derives new master key, re-wraps every workspace's DEK using the new master key + existing workspace salt, updates verifier, evicts all the user's vault sessions.
  - Refs: REQ-VAULT-5.

- [ ] **T-V-13 — Reset endpoint**
  - `POST /api/vault/reset`: requires `confirm: true`. Deletes `user_vault_credentials`, all `workspace_vault_keys` for the user (across all their workspaces), all `vault_*` data in those workspaces, all related access log entries.
  - Hard delete here is intentional — soft-delete would defeat the purpose.
  - Refs: REQ-VAULT-6.

---

## Server: entries, folders, tags

- [ ] **T-V-14 — Vault service skeleton**
  - `server/features/vault/service.ts` with CRUD on entries, folders, tags. All methods that read/write encrypted data require an unlocked session and unwrap the DEK on demand.
  - Refs: REQ-VAULT-7..11.
  - Done when: Unit tests cover create entry, update entry, list by folder, list by tag, soft delete, restore, duplicate, folder move, tag attach/detach.

- [ ] **T-V-15 — Folder operations**
  - Move folder (and children); delete folder with `move_to_parent` or `delete_recursive` strategy; depth check (≤ 5).
  - Refs: REQ-VAULT-9.

- [ ] **T-V-16 — Entry CRUD endpoints**
  - All entry routes per DESIGN-VAULT-API.
  - Permission guards.
  - Zod input validation; secret fields tagged for log redaction (DESIGN-VAULT-LOGGING).
  - Vault-locked → HTTP 423.
  - Refs: REQ-VAULT-7, REQ-VAULT-8, REQ-VAULT-12.

- [ ] **T-V-17 — Folder & tag endpoints**
  - All folder and tag routes per DESIGN-VAULT-API.
  - Refs: REQ-VAULT-9, REQ-VAULT-10.

- [ ] **T-V-18 — Title search**
  - List endpoint accepts `q` parameter, case-insensitive substring match against `title`.
  - Refs: REQ-VAULT-11.

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
