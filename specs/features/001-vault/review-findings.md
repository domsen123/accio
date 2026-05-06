# Vault — Architecture Review Findings

Consolidated output from five parallel `architecture-reviewer` agents run after T-V-11 through T-V-33 landed (commits `3b11c1d` … `4b472fd`). The reviewers covered five slices in parallel:

1. **Crypto / auth / session** — `crypto.ts`, `session-store.ts`, lifecycle endpoints, logout hook, sweeper, rate-limiter.
2. **Data layer + service** — schemas, migrations, `service.ts`, `access-log.ts`, `schemas.ts`, container wiring.
3. **HTTP API surface + permissions** — every `server/api/vault/**` route + `requireVaultUnlocked`.
4. **Orchestrator + UI** — `vault-search` / `vault-get-secret` tools, chat-handler integration, all `app/features/vault/**` and `app/pages/app/vault/**`.
5. **Cross-cutting** — tests, types, i18n, ADR alignment, deferrals vs. blockers.

Final quality gates at the time of review: `pnpm typecheck` clean, `pnpm lint` clean, **587/587 tests pass** (up from 553 pre-feature).

This document is descriptive — none of the findings have been fixed yet. Use it as the punch-list for the follow-up sweep.

---

## Critical — block before users store real secrets

### C1. `POST /api/vault/reset` lets any org member nuke other members' encrypted data
File: `server/api/vault/reset.post.ts`.

Enumerates every org the calling user is a member of (no role check, no master-password verification — by design, the user has forgotten it) and hard-deletes `workspace_vault_keys`, `vault_entries`, `vault_tags`, `vault_folders`, and `vault_access_log` for all of them. In a multi-member org, an unprivileged Member who never even set a master password can permanently destroy the Owner's vault with a single `POST {confirm: true}`. The header docstring acknowledges this as "accepted limitation"; it is **not safe** for the multi-member case the design otherwise allows.

**Options.** Gate by `vault:delete` + Owner role; scope to orgs where the caller actually owns wrappable keys; or block reset entirely when an org has more than one member.

### C2. Cross-user delete authority — soft/hard-delete entries with no master key
Files: `server/api/vault/entries/[id].delete.ts`, `server/api/vault/entries/[id]/purge.delete.ts`, also `service.ts:softDeleteFolder`, `tags/[id].delete.ts`.

These endpoints only require `requireVaultUnlocked` (the caller's own vault unlocked) plus `vault:delete`. They never verify the caller can actually decrypt the entry — so Member B (with their own master password set, vault unlocked under their own key) can purge entries that were created by Member A and wrapped under A's DEK. The cryptographic isolation is not matched at the authorisation layer.

### C3. `change-master` is not transactional — partial re-wraps brick workspaces
File: `server/api/vault/change-master.post.ts:73-127`.

The loop performs one `update` per workspace key, then a separate (un-batched) credentials update — none of it inside a DB transaction. If the process crashes (or the credentials update fails) after re-wrapping some workspace keys but before others, the verifier still matches the OLD password but some DEKs are now wrapped under the NEW master key (and vice versa) — those workspaces become permanently un-unlockable with no recovery (ADR-018). Must run inside `db.transaction` with all updates done via `tx`.

### C4. Master key leaks on error paths in `unlock.post.ts`
File: `server/api/vault/unlock.post.ts:57-62`.

`argon2idDeriveKey` allocates a 32-byte master-key buffer that is handed straight to `createSession` without `try/finally`. If `createSession` throws (session-store internal error, future hook), the buffer is never zeroed — directly contradicting the zeroisation guarantee documented in `crypto.ts:28-31`. Compare with `workspace/init.post.ts:70-87` which correctly wraps in `try/finally`.

### C5. `meta.vault_access=true` is never written to `orchestrator_actions`
Files: `server/features/orchestrator/audit.ts:193-248`, `server/database/schema/orchestrator-actions.ts:45`.

The flag is referenced by `vault-search.ts:14`, documented in the schema comment, and required by REQ-VAULT-14 / REQ-VAULT-18. But `auditService.recordPending` / `recordExecuted` / `recordFailed` never set any `meta` / `metadata` field. Audit views cannot highlight secret-touching actions; the only place the flag effectively lives is `vault_access_log`. T-V-20 task notes admit this is deferred.

### C6. Logging redaction is dead code
File: `server/features/vault/redact.ts`.

Exported and tested, but never imported anywhere outside its own test file (verified by grep). T-V-33 task notes call this a "follow-up". DESIGN-VAULT-LOGGING is therefore not satisfied: an unhandled exception inside `service.ts` carrying interpolated payload data would reach Nitro's default error logger raw.

### C7. Rate limiter trivially bypassable
Files: `server/features/vault/rate-limiter.ts:49`, used at `unlock.post.ts:43`.

Keyed only on `session.id`. A determined attacker drops/rotates the session cookie (or simply hits `/api/auth/login` again) and gets a fresh 5-attempt budget at zero cost. REQ-VAULT-3 says "per session" but the security intent is throttling brute force; the current implementation gives the attacker an unbounded pool of sessions per user. Should also key on `userId` (and ideally IP), with the stricter window winning.

### C8. Side-nav vault link not gated on `vault:read`
File: `app/layouts/app.vue:62-67`.

Renders the Vault entry unconditionally. Users without `vault:read` see a broken link. REQ-VAULT-14 / DESIGN-VAULT-FRONTEND require the indicator and nav to be permission-gated. T-V-23 / T-V-32 task notes both punt this to a future workspace switcher.

### C9. `unlock` / `lock` / `auto_lock` events are never logged
Files: schema enum + `access-log.ts:20-29`.

REQ-VAULT-19 enumerates these; the enum declares them; nothing writes them. T-V-19 task notes admit it ("`organisation_id` is `NOT NULL`, but unlock/lock are per-user…park"). Consequence: the audit-page filter dropdown shows event types that produce zero rows; "when did the user unlock?" is unanswerable. Either relax `organisation_id NOT NULL` or fan out per workspace on unlock.

### C10. `purge.delete.ts` access-log write is non-transactional + collides with `entry_delete`
File: `server/api/vault/entries/[id]/purge.delete.ts:33-43`.

The route logs `entry_delete` *before* calling `purgeEntry`. If `purgeEntry` later throws (entry was not soft-deleted, FK constraint, network blip) you have a phantom audit row claiming a deletion that never occurred. Worse, `softDeleteEntry` already emits `entry_delete` — purging a previously soft-deleted row produces a *second* `entry_delete` row with no way for the audit UI to distinguish soft from hard delete. There is no `entry_purge` enum value, which is itself a spec gap.

### C11. `restore.post.ts` logs as `entry_update` (enum gap)
File: `server/api/vault/entries/[id]/restore.post.ts:32-39`.

Explicitly papers over a missing enum value by logging restore as `entry_update`. This collides with normal updates in the audit timeline and breaks REQ-VAULT-19's traceability. Add `entry_restore` to the enum or accept the loss of fidelity explicitly in the spec.

---

## Major — fix soon

### M1. Zero HTTP-route test coverage
All five vault test files (`vault-crypto`, `vault-session-store`, `vault-service`, `vault-orchestrator-tools`, `vault-redact`) exercise the service / crypto / session-store / redact unit layer. There is no integration test for any of the 27 vault routes — setup, unlock (incl. rate limit), lock, status, change-master, reset, workspace/init, entry CRUD, folder/tag CRUD, reveal-log, access-log, trash. The 423-locked path, the 5-attempts/min rate limiter, idempotency 409s, permission gates, and the multi-member-reset behaviour are only verified by manual T-V-34 / T-V-35, both still unchecked.

### M2. No AAD on AES-GCM payload encryption
File: `server/features/vault/crypto.ts:142-171`.

`aesGcmEncrypt` / `aesGcmDecrypt` don't accept AAD. Each encrypted field (username, password, custom field) is independently AES-GCM encrypted with no binding to the entry id, organisation id, or field name. An attacker with DB write access (or a buggy migration) can swap a `password` blob from entry A into entry B, or move a `custom:apiKey` blob into the `password` slot, and decryption succeeds silently. Recommend AAD = `org_id || entry_id || field_name` for every blob.

### M3. `vault_search` tag hydration is dead code
File: `server/features/orchestrator/tools/vault-search.ts:158-192`.

Builds a `tagsById` map then drops it (`void tagsById`); every result returns `tags: []`. The contract in DESIGN-VAULT-TOOLS specifies `tags: string[]`. Silent, schema-shaped data loss to the LLM.

### M4. `vault_search` tag filter discards all but the first matched tag
File: `vault-search.ts:144-146`. Silently narrows AND-semantics to single-tag. Document in description or reject multi-tag input.

### M5. Service-layer transactions don't actually wrap `ItemService` writes
File: `server/features/vault/service.ts`.

In `createEntry` (557) and `duplicateEntry` (789), the transaction calls `vaultEntriesItemService.create(...)` — but the ItemService uses the *outer* `db` connection, not `tx`. Only `rewriteEntryTags(tx, ...)` runs in-transaction. If tag insertion fails, the entry is already committed and orphaned (no tags). Same problem in `updateEntry`: `resolveTagRows` (602) runs outside the transaction, so a partial tag insert can leave dangling new tag rows if the entry update later fails. Either pass `tx` into ItemService or do raw `tx.insert(...)` for the entry too.

### M6. DEK is not zeroed on errors thrown before `try` block
Files: `service.ts:550, 593, 651, 785`.

`createEntry`, `updateEntry`, `getEntry`, `duplicateEntry` all call `await unwrapWorkspaceDek(...)` outside the `try` block. If the code path between its return and entering `try` throws (allocator failure, V8 OOM), the DEK lives on in the heap. Idiomatic pattern: `let dek: Buffer | null = null; try { dek = await unwrap(...); ... } finally { dek?.fill(0) }`.

### M7. Cross-organisation leakage in folder helpers
Files: `service.ts:252` (`getAncestorChain`), `:290` (`computeMaxSubtreeDepth`).

`createFolder` calls `computeFolderDepth(input.organisationId, input.parentId)` without ever loading the parent to confirm `parentId` actually belongs to that org. A malicious caller can pass another workspace's `parentId`; the depth check passes silently, and `vaultFoldersItemService.create` then writes a folder whose parent FK points across organisations. The schema does not prevent this — the FK is just `references(vaultFolders.id)` with no org-scoping.

### M8. `requireVaultUnlocked` doesn't bind to workspace
File: `server/features/vault/api-utils.ts:33`.

Lookup uses `(user.id, session.id)`, not `(user.id, session.id, organisationId)`. If a user belongs to two orgs and only unlocked org A's vault, calling an entries route on org B will return 200 because the lock check passes — and the org B workspace-DEK unwrap will subsequently fail (or, worse, succeed if anyone ever shares wrapping). Vault sessions should be per `(userId, sessionId, organisationId)`.

### M9. `findOrCreateTag` race condition
File: `service.ts`.

Concurrent calls with the same name will both miss the SELECT and both INSERT; the unique index will reject one with a 23505 error rather than returning the existing row. Wrap in `INSERT … ON CONFLICT (organisation_id, lower(name)) DO UPDATE SET name = EXCLUDED.name RETURNING *`.

### M10. `softDeleteFolder` / `softDeleteEntry` don't cascade to entries-in-folder
File: `service.ts:334`.

`softDeleteFolder` is a plain `update` with `deletedAt`. Its entries remain `deletedAt = null`, so `listEntries({ folderId: <that folder> })` still surfaces them. Either remove `softDeleteFolder` from the public API in favour of `deleteFolder({ strategy })` or have it call `deleteFolder` internally.

### M11. `purgeEntry` doesn't snapshot title for audit retention
File: `service.ts:755`.

The FK in `vault_access_log.entry_id` is `SET NULL`, which is correct for audit retention, but historical queries lose the entry's title context. Consider snapshotting the title onto the audit row at write-time so post-purge audit views remain meaningful.

### M12. Folder-tree walks are O(N) round trips (N+1)
Files: `service.ts:getAncestorChain`, `computeMaxSubtreeDepth`, `deleteFolder('delete_recursive')`.

One query per folder. With a 5-level limit ancestors are bounded, but `delete_recursive` and `computeMaxSubtreeDepth` walk the full subtree breadth-first, one query per parent. Use a recursive CTE (`WITH RECURSIVE descendants AS …`).

### M13. `vault_access_log` lacks `(entry_id, created_at)` index
The audit-list view (REQ-VAULT-19, T-V-29) wants per-entry history. Existing indexes are `(org, created_at)` and `(org, event_type)`. Add `(org_id, entry_id, created_at DESC)`.

### M14. `vault_access_log.user_id ON DELETE CASCADE` destroys audit history
File: `vault-access-log.ts:42`. Use `SET NULL` like `entry_id` and `conversation_id`. Right now deleting a user erases their decrypt history — bad for compliance.

### M15. `vault_folders.parent_id ON DELETE SET NULL` defeats `delete_recursive`
If a folder is hard-deleted (vault Reset, future Trash purge), all its children get `parent_id = NULL`, silently re-parenting to root. Consider `ON DELETE RESTRICT` and force the service to do explicit recursion, or accept and document.

### M16. Logout / password-reset / session invalidation gaps
File: `server/api/auth/reset-password.post.ts` + `auth.service.ts:459-465`.

Password reset updates `passwordHash` but never calls `vaultSessionStore.evictByUser` and never invalidates other auth sessions. After a forced password reset the attacker who already unlocked the vault retains the in-memory master key. Same likely applies to `sessions/[id].delete.ts` and `sessions/others.delete.ts` — not reviewed in detail.

### M17. `change-master` doesn't enforce login-password ≠ new master password
File: `change-master.post.ts`.

`setup.post.ts:26-28` checks the master password isn't the login password. `change-master.post.ts` does not — a user can rotate their master password to equal their login password. Inconsistent policy across the slice.

### M18. Unlock rate-limit consumes budget on success
File: `unlock.post.ts:43`.

`checkAndRecord` runs before `verifyMasterPassword`, so successful verifications also count. Pattern should be record-on-fail so honest users effectively have unlimited successful unlocks.

### M19. Redaction coverage gaps
File: `redact.ts:23-42`.

Misses snake_case forms (`master_password`, `master_verifier`, `master_salt`, `master_kdf_salt`, `wrapped_dek`, `wrap_iv`, `wrap_tag`) emitted by Drizzle queries / SQL logs. Misses `dek`, `masterKey`, `oldMasterKey`, `newMasterKey`, `cipherText`, `plaintext`. `value` is over-broad (any field literally named `value` is wiped). `redactErrorForLog` keeps the stack — Argon2 native error messages and AES-GCM decipher errors sometimes embed parameter bytes; safer to clip frames originating in `node:crypto` / `argon2`.

### M20. `decryptEntryPayload` aborts the whole entry on one bad custom field
File: `service.ts`. A single corrupted custom field throws `TypeError`, killing decryption of the entire entry (including username/password). For a vault, partial recovery matters. Catch per-field and surface a sentinel like `{ corrupted: true }`.

### M21. `updateEntry` TOCTOU between existence check and update
File: `service.ts:586-617`. Between the check and the update, another caller can soft-delete the row. The update silently no-ops because `WHERE id = ...` matches but the row is now `deletedAt != null`. Add `AND deleted_at IS NULL` to the update predicate or do the check inside `tx`.

### M22. `tags/[id].delete.ts` uses `listTags` for an existence check
File: line 30-35. Fetches all workspace tags just to scope-check a single id. O(n) per delete. Add a scoped `findTagById({ id, organisationId })` on the service.

### M23. Zod gaps that flow to the access log / encryption
File: `server/features/vault/schemas.ts`.

- `createEntryBodySchema.folderId` and `tagNames` items have no `uuid()` / id-shape validation.
- `customFieldSchema.value` has no max length — a user can submit a 100MB string that gets encrypted and stored.
- `entryPayloadSchema.url` is `z.string()` not `z.url()` — bad data lands in encrypted storage.
- `payload.notes` and `customFields[].value` have no length cap.

### M24. `access-log.get.ts` should require `vault:audit:read`, not `vault:read`
Audit-log access is typically a higher-privileged operation than normal vault reads. Granting it to anyone with `vault:read` means every vault user can see every other user's reveal history.

### M25. Folder PATCH not transactional
File: `folders/[id].patch.ts`. Performs sequential rename → move; if rename succeeds but move fails the DB is in a half-applied state. Wrap in a transaction.

### M26. `reveal.post.ts` field regex inconsistent with `customFieldSchema`
File: `reveal.post.ts:18` uses `^(?:username|password|notes|custom:[\w\- ]{1,80})$`. The `customFields` schema (`schemas.ts:11-15`) allows names up to 100 chars with any characters. Reveals on a custom field whose name contains `:` or `/` will fail validation server-side after the user successfully created it. Also `url` is not in the reveal regex — clients cannot log a `url` reveal.

### M27. No rate-limiting on the reveal endpoint or audit-log read
Files: `reveal.post.ts`, `access-log.get.ts`. An authenticated, vault-unlocked attacker (or buggy client) can flood `vault_access_log` with `ui_reveal` rows, polluting forensic queries. The `count(*)` on every audit-log page will become a hot-path bottleneck.

### M28. Folder & tag mutations write no audit-log row
Files: `folders/index.post.ts`, `folders/[id].patch.ts`, `folders/[id].delete.ts`, `tags/index.post.ts`, `tags/[id].delete.ts`.

REQ-VAULT-19 mandates an audit trail; these are user-visible state changes admins will want to audit, especially `delete_recursive` folder deletes (which can soft-delete many entries without producing per-entry log rows).

### M29. SSE confirm/cancel routes can't return real 4xx
Files: `confirm.post.ts:68-86`, `cancel.post.ts`. Both routes open SSE before `loadPendingAction` runs; any throw inside `resumeFromConfirmation` becomes an SSE `error` event over a `200 OK` stream. Comments acknowledge this but the route docblocks claim "404 / 409 thrown before SSE opens" — they're not.

### M30. Inconsistent error-code surface across routes
Most vault routes throw `createError({statusMessage: 'vault.foo.bar'})` namespaced strings — good. But `requireVaultUnlocked` throws `vault.locked`, the workspace resolver throws `workspace.access_denied` / `workspace.no_membership` / `auth.unauthenticated`, and Zod parse failures bubble up as raw H3 400s with no `vault.*` code at all. The unlock dialog's i18n catalog only knows `vault.*` keys, so any non-vault error code routes to `vault.entry.error_generic`.

### M31. `vault_get_secret` skips access log on `entry_not_found` / `field_not_found`
File: `vault-get-secret.ts:108-115`. A confirmed reveal that probes for a non-existent field still reaches the LLM as a tool invocation but leaves no `vault_access_log` row — gap in the user's "what did the AI try?" narrative.

### M32. Impersonation sessions not specially handled
Vault session-store keyed on `(userId, sessionId)` would let an impersonator unlock and read on behalf of a real user. Verify that impersonation tokens cannot reach `/api/vault/unlock` (or block them explicitly).

### M33. Argon2 params drift between compile-time and per-row record
Files: `crypto.ts`, `unlock.post.ts`, `change-master.post.ts`.

`ARGON2_PARAMS` (compile-time) and `creds.argon2Params` (per-row) are not compared on unlock. If a deployment raises params, old verifiers will silently keep working under old params (correct), but new derivations on `change-master` use the current compile-time value with no migration story per row. Add an explicit `params` argument and read it from `creds.argon2Params` on unlock.

### M34. `useSecretClipboard` race condition on rapid copies
File: `app/features/vault/composables/useSecretClipboard.ts:45-60`.

Module-scoped `lastValue` is shared across `copy()` calls. If `copy()` is called twice fast (user copies username then password), the first timer's readback compares against the *new* `lastValue` and may erase the second value early.

### M35. `VaultUnlockDialog` `light` div only wraps `#body`
File: `VaultUnlockDialog.vue:53`. The `UModal` title/header/overlay are outside the `light` div. DESIGN.md says modals should remain readable in dark mode; verify the header surface against the `light` requirement.

### M36. Lock indicator accessibility
File: `VaultLockIndicator.vue`. Padlock icon has `aria-label`/`title` (good), but the popover content (`statusUnlocked`/`statusLocked` h3) is not announced when the popover opens — no `role="status"` or `aria-live`. Screen-reader users miss state changes after Lock-now.

### M37. Password generator UX gaps
File: `app/features/vault/utils/passwordGenerator.ts:62-79`.

- Modulo bias on `buf[0]! % pool.length` — negligible for pool sizes ≤64 but not zero; spec invokes "CSPRNG" without bias caveat.
- `excludeAmbiguous` defaults to true (good) but the UI never exposes the toggle, so users cannot opt out — REQ-VAULT-20's "user-configurable" intent is partially unmet.

---

## Minor

### m1. i18n duplicate-key bug
Files: `i18n/locales/{en,de}.json` lines 1404-1408. Contains literal-dot-keyed entries inside `vault.unlock` (`"vault.unlock.invalid": "..."`) shadowing the proper sibling keys above. Same bogus block duplicated in the `de` file. Five orphan keys; `vault.locked` is at the wrong nesting depth.

### m2. Orphan i18n keys
30 keys defined but unused (`vault.setup.minLength`, `vault.entry.duplicate`, `vault.folders.depthExceeded`, etc.). Either wire into error-code → message routing in the unlock dialog or delete.

### m3. Cross-feature coupling
Every vault route imports `resolveWorkspace` from `server/features/kb/workspace.ts` rather than from a shared module. Hoist to `server/features/workspace/` to avoid the implication that vault depends on KB.

### m4. `vaultService.listTags` doesn't filter `deletedAt`
But `vault_tags` has no `deletedAt` column either. Inconsistent with folders/entries; document the asymmetry or add tombstones.

### m5. `setup.post.ts` `bcrypt.compare` against null hash
File: `setup.post.ts`. Runs unconditionally. If `passwordHash` is null (SSO-only future), the check silently passes. Also adds ~150 ms to every setup at bcrypt-cost-12. Acceptable today; flag for the SSO path.

### m6. Stale schema comment about `__root__` sentinel
File: `schemas.ts` lines 43-46. Comment claims `__root__` is the sentinel for "folderId IS NULL", but the schema uses `rootOnly: z.coerce.boolean()`.

### m7. Empty PATCH writes a no-op `entry_update` audit row
File: `entries/[id].patch.ts`. A PATCH with empty body is accepted by Zod (every field optional) and still writes an audit row. Either reject empty PATCHes at the schema level or skip the log when no patch was applied.

### m8. `findFolderById` doesn't filter soft-deleted
File: `service.ts:findFolderById`. Returns tombstoned folders; callers must remember to check `deletedAt`. Inconsistent with `listFolders` which does filter.

### m9. `restoreEntry` doesn't validate target folder still exists
File: `service.ts:740`. Restoring into a tombstoned folder produces an orphan-feeling entry.

### m10. `MAX_FOLDER_DEPTH` magic constant
File: `service.ts:233`. Export from a `constants.ts` so the API layer / UI can render the same limit message.

### m11. Inconsistent 201 responses on POST routes
`entries/index.post.ts` and `duplicate.post.ts` set 201; `folders/index.post.ts` and `tags/index.post.ts` create resources but return 200.

### m12. `vaultSessionStore` map size is unbounded
A compromised account can spam new auth sessions and trigger unlock for each, creating arbitrary entries. Each holds a 32-byte master key plus metadata — small, but unbounded. Consider an LRU cap with eviction (and explicit zeroisation).

### m13. Rate-limiter timer accumulates dead keys
File: `rate-limiter.ts`. `hits` map is never pruned of stale keys (only individual entries' arrays are filtered on hit). Long-lived processes accumulate dead `sessionId` keys.

### m14. Sweeper plugin has no error boundary
File: `server/plugins/03.vault-session-sweeper.ts`. Unhandled throw inside `sweep` would kill the interval. Wrap in `try/catch` and log redacted.

### m15. `reset.post.ts` uses bare `confirm: true`
Spec calls for a "hard confirmation"; consider a typed confirmation string (`DELETE MY VAULT`) to match the destructive-irreversible labelling promise. The UI requires typing `RESET` (T-V-30) but the API doesn't enforce it.

### m16. `vault-search` results carry `tags: []` placeholder
See M3 — listed again here because the JSON contract is structurally fine, just empty.

### m17. `revealed` map in `VaultEntryForm` keyed by `custom:${field.name}`
File: `VaultEntryForm.vue:165-175`. If the user renames the field while revealed, the map key drifts and you get ghost reveal state.

### m18. `change-master` doesn't gate behind unlocked vault
File: `change-master.post.ts`. Doesn't check `requireVaultUnlocked` — fine in principle (the user provides the current password), but the spec wording in REQ-VAULT-5 says "while the vault is unlocked".

---

## What to fix first

Before users store real secrets, the load-bearing fixes are:

1. **C1 + C2** — multi-user-org data destruction. Either lock down to single-member orgs, or layer crypto-aware authorisation on top of `vault:delete`.
2. **C3** — wrap `change-master` in a transaction. Without this a crash creates unrecoverable workspaces.
3. **C6** — wire `redactErrorForLog` and `redactSecrets` into actual log paths. The helpers are tested but unused.
4. **M1** — at minimum, integration tests for the 423 path, the rate limiter, and the multi-member reset behaviour.

Everything else is honest follow-up work.
