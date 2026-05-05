# Feature 001 — Vault

A built-in password and secrets manager, scoped per workspace, with master-password-protected encryption and orchestrator integration.

## Documents in this Feature

| File | Purpose |
|------|---------|
| `README.md` | Overview, scope, integration points (this file) |
| `requirements.md` | New requirements specific to this feature |
| `design.md` | New data model, API endpoints, tool contracts, crypto design |
| `tasks.md` | Atomic tasks for implementation |

ADRs continue in the project-wide `specs/decisions.md` (this feature adds ADR-016 through ADR-019).

## How this feature relates to the v1 spec

This feature **extends** the v1 hub but doesn't conflict with it. References to v1 use the original IDs (e.g. `REQ-COMMON-1`, `DESIGN-CRYPTO`, `ADR-009`).

What it reuses from v1:
- Workspace scoping (`organisation_id` on every table) — `REQ-WS-2`.
- Soft delete pattern — `REQ-COMMON-2`, `ADR-009`.
- Audit log infrastructure — `orchestrator_actions` table from v1 gets used (with a new `vault_access` flag).
- Permission system — adds `vault:*` permissions following the existing scheme.
- `/app/**` route convention — `ADR-015`.
- i18n conventions — `DESIGN-I18N`.

What it doesn't touch:
- The v1 KB, Todos, Projects, and Orchestrator features keep working as-is.
- The existing crypto utility (`encryptForOrg` / `decryptForOrg` from `DESIGN-CRYPTO`) is **not used** for vault data. Vaults need a stronger model — see `design.md` §VAULT-CRYPTO and ADR-017.

## Scope

### In scope
- Vault entries with fixed fields (title, username, password, url, notes) plus arbitrary user-defined custom fields (string, with optional `is_secret` flag).
- Nested folders (KeePass-style) for organisation, plus tags.
- Master password separate from login password. Vault unlocks per session; auto-locks after 30 min inactivity, on logout, and via manual lock.
- Per-workspace encryption: same master password, but cryptographically isolated keys per workspace.
- Strict secret hygiene: secret values are never logged, never serialised to anything other than the encrypted DB column or transient response payloads.
- Orchestrator integration:
  - `vault_search` returns metadata only (no secrets).
  - `vault_get_secret` returns plaintext, requires user confirmation, logged with elevated marker in audit log.
  - Orchestrator cannot create, edit, or delete vault entries.
- Vault status indicator and lock action in the top nav.

### Out of scope (for now)
- Browser autofill / browser extension. Explicitly rejected by the user.
- Sharing vault entries between workspaces.
- TOTP code generation / authenticator-app role.
- Password generator UI (basic generator may be added — see optional task).
- Importing from KeePass / Bitwarden / 1Password.
- Recovery codes / SSO recovery / break-glass admin recovery. If you forget the master password, the vault is gone. The user accepts this trade-off (ADR-018).
- Hardware-key (YubiKey, etc.) integration.
- Cross-device session continuity for the unlocked vault. Each browser session must unlock independently.

## Glossary additions

| Term | Meaning |
|------|---------|
| **Vault** | The encrypted store of secret entries, scoped per workspace. |
| **Vault Entry** | A single record with a title, optional standard fields (username, password, url, notes), and zero or more custom fields. Lives in a folder. |
| **Custom Field** | Arbitrary key-value pair on a vault entry. Has a `is_secret` flag controlling whether the value is masked in the UI. |
| **Master Password** | A user-set password, separate from the login password, used to derive the vault encryption key. Never sent to the server in plaintext after initial setup — see VAULT-CRYPTO. |
| **Master Key** | A 32-byte key derived from the master password via Argon2id. Lives only in server memory during an unlocked session. |
| **Workspace Vault Key** | A per-workspace 32-byte key derived from the master key via HKDF. Used as AES-256-GCM key for entries in that workspace. |
| **Vault Session** | The state where the vault is "unlocked" for a given user/browser session. Identified by an in-memory entry holding the master key, scoped by user + session. Expires on auto-lock, manual lock, or logout. |
| **Locked / Unlocked** | UI state. Locked: master key not in server memory; entries cannot be decrypted. Unlocked: master key in memory; entries decrypt on demand. |

## Integration points (high-level)

- **Side nav:** new top-level entry "Vault" linking to `/app/vault`.
- **Top nav:** lock-status icon (closed/open padlock). Click opens a popover with quick-lock action and lock-status info. Visible across all `/app/**` pages.
- **Orchestrator:** two new read tools registered in the existing tool registry; both gated on the vault session being unlocked.
- **Permissions:** four new permissions; reuse existing role assignment patterns.
- **Database:** five new tables; one new column on the existing `orchestrator_actions` (a `meta` jsonb field will be added if not already present, used to flag `{"vault_access": true}`).

## Build approach

Single-phase build. The feature is isolated enough to ship as one increment after which the user can immediately start storing real secrets. Tasks are atomic and ordered so that the data layer and crypto land before any UI is built.
