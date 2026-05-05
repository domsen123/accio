# Vault — Design

Implementation reference for the vault feature: data model, crypto, API endpoints, MCP tool contracts, and architectural notes.

References to v1: `REQ-XX`, `DESIGN-XX`, `ADR-XX`. References to this feature: `REQ-VAULT-XX`, `DESIGN-VAULT-XX`, `ADR-016`+.

---

## DESIGN-VAULT-ARCH — Architecture overview

A new vertical slice:

```
app/features/vault/                  # Client-side Vue components, pages, composables
server/features/vault/                # Server-side service, crypto, tools
  ├── service.ts                     # CRUD over entries/folders/tags
  ├── crypto.ts                      # Vault-specific crypto utilities
  ├── session-store.ts               # In-memory map of unlocked sessions
  ├── tools/                         # Orchestrator tools (vault_search, vault_get_secret)
  └── api/                           # Nitro route handlers
```

The vault uses its **own** crypto path, not the shared `encryptForOrg` from v1's `DESIGN-CRYPTO`. The reasons are detailed in ADR-017: vault data needs a master-password-gated key that the server cannot reproduce on its own.

Routes follow the v1 convention (ADR-015): all vault pages under `/app/vault/**`, all API endpoints under `/api/vault/**`.

---

## DESIGN-VAULT-CRYPTO — Cryptographic design

### Goals
- The user's master password is the only thing standing between an attacker with full DB access and the plaintext.
- Workspaces are cryptographically isolated.
- Changing the master password does not require re-encrypting every entry.

### Components

**1. Master-password verifier (per user)**

When the user sets the master password, the server stores:
- `master_salt` (16 random bytes, base64)
- `master_verifier` = Argon2id(master_password, master_salt, t=3, m=64MB, p=1) — the standard verification hash
- `master_kdf_salt` (16 random bytes, separate from the verifier salt; used to derive the master key — see below)

The verifier exists *only* to check whether a submitted password is correct. The actual key derivation uses the separate `master_kdf_salt` so that brute-forcing the verifier doesn't directly yield the master key.

Stored on a new `user_vault_credentials` table (one row per user, not per workspace).

**2. Master key (in memory only)**

When the user unlocks: `master_key = Argon2id(master_password, master_kdf_salt, t=3, m=64MB, p=1)`. 32 bytes. **Never stored.** Lives in the `session_store` indexed by `(user_id, session_id)`.

**3. Per-workspace data encryption key (DEK)**

Each workspace has a DEK — a 32-byte random key generated when the workspace's vault is provisioned. The DEK is what actually encrypts entries (AES-256-GCM).

The DEK is stored **wrapped** in `workspace_vault_keys`:
- `wrapped_dek` = AES-256-GCM-encrypt(DEK, key=HKDF(master_key, salt=workspace_salt, info="vault-dek-wrap"))
- `wrap_iv`, `wrap_tag` (the GCM components)

When the vault is unlocked, the server derives the wrapping key and unwraps the DEK on demand for each request. The unwrapped DEK lives only for the duration of the request.

**4. Why this scheme**

- **Master password change**: only re-wrap the DEK, not all entries. Cheap.
- **Workspace isolation**: each workspace has its own DEK; even if you have the master key in memory, you can only unwrap a workspace's DEK if you also have the workspace's `workspace_salt`.
- **Forward-shrinking blast radius**: an attacker who compromises one wrapped DEK still has to brute-force Argon2id to get the master key before touching other workspaces (they'd need each workspace's salt, which is stored alongside but doesn't help without the master password).

### Field-level encryption

Each encrypted field stores: `{ciphertext, iv, tag}` as a JSON column or as three concatenated columns (implementation choice — JSON column is simpler and the size is negligible).

For the entry record, the encrypted blob structure is:
```json
{
  "username": {"ct": "...", "iv": "...", "tag": "..."} | null,
  "password": {"ct": "...", "iv": "...", "tag": "..."} | null,
  "url":      {"ct": "...", "iv": "...", "tag": "..."} | null,
  "notes":    {"ct": "...", "iv": "...", "tag": "..."} | null,
  "custom_fields": [
    {"name": "token", "is_secret": true, "value": {"ct": "...", "iv": "...", "tag": "..."}},
    {"name": "host",  "is_secret": false, "value": "ssh.example.com"}
  ]
}
```

`custom_fields[].value` is encrypted only if `is_secret` is true; otherwise it's plaintext. (User-defined fields with `is_secret=false` exist for things like an SSH host or username that the user wants visible.)

The plaintext `custom_fields[].name` is stored unencrypted to allow the orchestrator's metadata search to mention which custom fields exist on an entry.

### Plaintext vs. encrypted columns on `vault_entries`

| Field | Encryption |
|---|---|
| `id`, `organisation_id`, `folder_id`, `created_*`, `updated_*`, `deleted_at` | plain |
| `title` | **plain** (see ADR-019) |
| `tags` (junction) | plain |
| `username`, `password`, `url`, `notes` | encrypted in the JSON blob |
| Custom fields | each plain or encrypted per `is_secret` |

### KDF parameters

Argon2id with `t=3, m=64MB, p=1`. Reasonable balance for a self-hosted single-user app. Tunable; document the choice in code so it can be raised over time as hardware improves.

### Ciphers and libraries

- AES-256-GCM via Node's built-in `node:crypto`.
- Argon2id via the `argon2` npm package (well-maintained, native bindings).
- Random bytes via `crypto.randomBytes` (server-side) or `crypto.getRandomValues` (client-side, for password generator).

---

## DESIGN-VAULT-SESSION — Session store

The unlocked vault session is **server-side, in-memory only**.

```ts
type VaultSession = {
  userId: ULID
  sessionId: string                   // tied to the existing auth session
  masterKey: Buffer                   // 32 bytes
  unlockedAt: Date
  lastActivityAt: Date                // updated on every vault API call
}
```

Stored in a `Map<string, VaultSession>` keyed by `${userId}:${sessionId}`.

A timer runs every 60 seconds and evicts sessions where `now - lastActivityAt > 30 minutes`. Eviction zeros the master key buffer (`buffer.fill(0)`) before deletion.

Logout calls explicitly evict the session. Server restart implicitly evicts (the map is in-process memory).

**Concurrency note:** if the user is logged in across multiple browser tabs sharing the same auth session, they share the same vault session. Different sessions (different browsers / devices) need to unlock independently. This is by design.

**Multi-instance note:** if the app runs behind multiple Node processes (e.g. PM2 cluster mode), the session map is per-process and the user might experience "vault locked" when their request lands on a different worker. **The hub is single-process for now** (Coolify default); if this changes, the session store becomes shared (Redis with encryption-at-rest, or sticky sessions). Documented as a known constraint.

---

## DESIGN-VAULT-DATA — Data model

All tables follow the v1 conventions: ULID primary keys, `created_at`, `updated_at`, soft-delete `deleted_at` where applicable, `organisation_id` foreign key (except for `user_vault_credentials` which is per-user).

### `user_vault_credentials`
| Column | Type | Notes |
|---|---|---|
| `user_id` | ulid | PK, FK users |
| `master_salt` | bytea (16 bytes) | for the verifier |
| `master_verifier` | bytea | Argon2id output |
| `master_kdf_salt` | bytea (16 bytes) | for the master key derivation |
| `argon2_params` | jsonb | `{t, m, p, version}` recorded for future upgrade migrations |
| `created_at`, `updated_at` | | |

### `workspace_vault_keys`
| Column | Type | Notes |
|---|---|---|
| `id` | ulid | PK |
| `organisation_id` | ulid | FK, unique (one row per workspace) |
| `workspace_salt` | bytea (16 bytes) | for HKDF when wrapping the DEK |
| `wrapped_dek` | bytea | AES-256-GCM-encrypted DEK |
| `wrap_iv` | bytea (12 bytes) | |
| `wrap_tag` | bytea (16 bytes) | |
| `created_at`, `updated_at` | | |

### `vault_folders`
| Column | Type | Notes |
|---|---|---|
| `id` | ulid | PK |
| `organisation_id` | ulid | FK |
| `parent_id` | ulid | self-FK, nullable |
| `name` | text | |
| `created_at`, `updated_at`, `deleted_at` | | |

Index: `(organisation_id, parent_id)`.

### `vault_entries`
| Column | Type | Notes |
|---|---|---|
| `id` | ulid | PK |
| `organisation_id` | ulid | FK |
| `folder_id` | ulid | FK vault_folders, nullable (root) |
| `title` | text | **plaintext** (see ADR-019) |
| `payload` | jsonb | The encrypted blob (see DESIGN-VAULT-CRYPTO §field-level) |
| `created_by` | ulid | FK users |
| `created_at`, `updated_at`, `deleted_at` | | |

Index: `(organisation_id, folder_id)`, `(organisation_id, deleted_at)`.

### `vault_tags`
| Column | Type | Notes |
|---|---|---|
| `id` | ulid | PK |
| `organisation_id` | ulid | FK |
| `name` | text | unique per `organisation_id`, case-insensitive |
| `created_at`, `updated_at` | | |

### `vault_entry_tags` (junction)
| Column | Type | Notes |
|---|---|---|
| `entry_id` | ulid | PK part, FK vault_entries |
| `tag_id` | ulid | PK part, FK vault_tags |

### `vault_access_log`
| Column | Type | Notes |
|---|---|---|
| `id` | ulid | PK |
| `organisation_id` | ulid | FK |
| `user_id` | ulid | FK users |
| `entry_id` | ulid | FK vault_entries, nullable (vault unlock has no entry) |
| `event_type` | enum | `unlock` \| `lock` \| `auto_lock` \| `ui_reveal` \| `orchestrator_reveal` \| `orchestrator_search` \| `entry_create` \| `entry_update` \| `entry_delete` |
| `field_name` | text | nullable; e.g. `password`, `notes`, `custom:token` |
| `reason` | text | nullable; populated for `orchestrator_reveal` |
| `conversation_id` | ulid | FK orchestrator_conversations, nullable |
| `created_at` | | |

### Update to `orchestrator_actions` (v1 table)

If the column doesn't already exist:

| Column | Type | Notes |
|---|---|---|
| `meta` | jsonb | nullable. Used to flag `{"vault_access": true}` and other future per-action metadata. |

If `meta` already exists, no change needed.

---

## DESIGN-VAULT-API — REST API endpoints

All routes require auth and resolve workspace from the active session. Vault routes additionally require:
- A valid vault session (master key in memory) for any operation that decrypts entries — return HTTP 423 (Locked) if not.
- Permission `vault:read` for GETs, `vault:write` for POST/PATCH, `vault:delete` for DELETE.

```
# Master password & session
POST   /api/vault/setup                       # First-time setup. Body: { master_password }. Idempotent on existing user
POST   /api/vault/unlock                      # Body: { master_password }. Sets up session.
POST   /api/vault/lock                        # Manual lock
GET    /api/vault/status                      # { is_setup, is_unlocked, locks_at? }
POST   /api/vault/change-master               # Body: { current, new }
POST   /api/vault/reset                       # Body: { confirm: true }. Wipes ALL workspaces' vault data for this user

# Workspace setup (first time per workspace)
POST   /api/vault/workspace/init              # Body: { master_password }. Provisions the workspace's DEK.

# Folders
GET    /api/vault/folders                     # Tree
POST   /api/vault/folders                     # { name, parent_id? }
PATCH  /api/vault/folders/[id]                # { name?, parent_id? }
DELETE /api/vault/folders/[id]                # { strategy: "move_to_parent" | "delete_recursive" }

# Tags
GET    /api/vault/tags
POST   /api/vault/tags                        # also auto-created on use
DELETE /api/vault/tags/[id]                   # cleanup unused

# Entries
POST   /api/vault/entries                     # Create. Body decrypted on server, re-encrypted with workspace DEK.
GET    /api/vault/entries                     # List. Filters: folder_id, tag_id, q (title FTS).
GET    /api/vault/entries/[id]                # Get with decrypted payload.
PATCH  /api/vault/entries/[id]
DELETE /api/vault/entries/[id]                # Soft delete
POST   /api/vault/entries/[id]/restore
POST   /api/vault/entries/[id]/duplicate
GET    /api/vault/trash                       # Soft-deleted list
DELETE /api/vault/entries/[id]/purge          # Hard delete (only from trash, requires unlock)

# Access log
GET    /api/vault/access-log                  # Filters: entry_id, event_type, since
```

### Reveal endpoint behaviour

Reads are decrypted on the server and returned as JSON. The client never sees ciphertext directly — that would just shift the decryption to the browser, which doesn't have the master key (because it's server-side only in this design).

When the client renders an entry detail view, every secret field is fetched as part of the entry payload but the UI hides them behind a "reveal" toggle. Each toggle click produces a `ui_reveal` log entry (REQ-VAULT-19).

---

## DESIGN-VAULT-TOOLS — Orchestrator tool contracts

### `vault_search` (read, auto-class)
- **Description:** Search vault entries by title, folder path, or tag. Returns metadata only — never secret values.
- **Inputs:**
  ```
  query?: string             # matches against title (case-insensitive substring)
  folder_path?: string       # e.g. "Work / GitHub"
  tags?: string[]
  limit?: number             # default 10, max 25
  ```
- **Returns:**
  ```
  results: [{
    id: string,
    title: string,
    folder_path: string,
    tags: string[],
    has_username: boolean,
    has_password: boolean,
    custom_field_names: string[],     # plain field names (the user named them, this is fine)
    created_at: string
  }]
  ```
- **Vault locked behaviour:** Returns `{"error": "vault_locked"}` and emits an SSE event to the chat UI prompting the user to unlock. The orchestrator surfaces this as plain text and does not retry.

### `vault_get_secret` (read, **confirm-class**)
- **Description:** Reveal a single secret field of a vault entry. Always requires user confirmation.
- **Inputs:**
  ```
  entry_id: string
  field: string              # "username" | "password" | "notes" | "custom:<name>"
  reason: string             # required, free-text, why does the orchestrator want this?
  ```
- **Returns (on confirm):**
  ```
  value: string
  ```
- **Confirmation card warning text:** "The secret will be sent to the LLM provider. Confirm only if necessary."
- **Logging:** Writes to `vault_access_log` with `event_type=orchestrator_reveal`, plus to `orchestrator_actions` with `meta.vault_access=true` regardless of whether the user confirmed or cancelled. The cancellation case logs with `confirmed=false` (existing audit log column from v1).
- **Permission:** Requires the user to have `vault:orchestrator:reveal`. If they don't, the tool isn't registered for their conversations.

### What's NOT exposed
No `vault_create_entry`, `vault_update_entry`, `vault_delete_entry`, `vault_change_password`, etc. The orchestrator never writes to the vault. (REQ-VAULT-16, ADR-020.)

---

## DESIGN-VAULT-FRONTEND — UI shell

### Pages

```
/app/vault                    # Entry list (default folder = root)
/app/vault/folders/[id]       # Entry list filtered to a folder
/app/vault/entries/[id]       # Entry detail / edit
/app/vault/trash
/app/vault/audit              # Vault access log
/app/vault/settings           # Master password change, vault reset
```

### Components

- **Top-nav lock icon** (in the global app layout): closed/open padlock. Click → popover with "Lock now", remaining auto-lock time, and "Settings" link. The icon only renders when the user has `vault:read`.
- **Unlock dialog**: modal that intercepts navigation to vault pages and tool invocations. Master password input, "Remember for 30 minutes" hint (the auto-lock duration), submit button.
- **Folder tree** (sidebar within `/app/vault`): KeePass-style nested folders with drag-and-drop reorder. New-folder button at each level.
- **Entry list**: table with title, username (masked dots if present), URL favicon (best-effort), tags as chips, last-modified date, action menu (copy username / copy password / open URL / reveal / edit / move / delete).
- **Entry detail view**: form-style. Standard fields at top, custom fields below (with add/remove rows), folder picker, tag picker. "Reveal" toggle next to each secret field. "Copy" button next to every value field (incl. non-secret). Password field has the generator button.
- **Confirmation card for `vault_get_secret`** (in orchestrator chat): more visually distinct than the generic confirm card — yellow/red border, explicit warning text per REQ-VAULT-15.

### Internationalisation

All vault UI strings live in `i18n/locales/{de,en}.json` under the `vault.*` key prefix, per `DESIGN-I18N`.

---

## DESIGN-VAULT-PERMISSIONS — RBAC

Four new permissions:

```
vault:read
vault:write
vault:delete
vault:orchestrator:reveal
```

Default role assignments:

| Role | Permissions |
|---|---|
| Owner | all four |
| Admin | `vault:read`, `vault:write`, `vault:delete` (no orchestrator reveal) |
| Member | `vault:read`, `vault:write`, `vault:delete` (no orchestrator reveal) |

`vault:orchestrator:reveal` is owner-only by default because it controls whether secrets can be sent to the LLM provider. Workspace owner can grant it to others via the existing role customisation (if the starter supports per-org role customisation; otherwise this is fixed in seed and changing it is a code change — that's fine for now).

---

## DESIGN-VAULT-LOGGING — Logging hygiene

- The string "password", "secret", "token" appearing as a *value* must never reach any logger output. Field names, log levels, and route names are fine.
- Stack traces from vault routes are sanitised before logging: any thrown error from the vault module gets its message replaced with `"<vault error: redacted>"` before going to the logger. The full message is still returned to the client (so the user sees what went wrong) but not persisted.
- The Zod schema for vault inputs uses `.transform(redactInLogs)` markers on secret fields; the request logger middleware honours these markers. (Implementation: a small `redact.ts` helper that the middleware imports.)

---

## DESIGN-VAULT-MIGRATION — From nothing

This feature ships in one migration. No data exists before, so no data migration is needed. The migration adds:
- 6 new tables (`user_vault_credentials`, `workspace_vault_keys`, `vault_folders`, `vault_entries`, `vault_tags`, `vault_entry_tags`, `vault_access_log`).
- 1 conditionally-new column (`orchestrator_actions.meta` jsonb, only if missing).
- New permissions in seed.
