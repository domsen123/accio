# Vault — Requirements

User stories and acceptance criteria for the vault feature. Format follows the v1 spec convention. Requirement IDs are prefixed with `REQ-VAULT-`.

---

## REQ-VAULT-1 — Master password setup

**As a** user
**I want** to set a master password the first time I open the vault in a workspace
**So that** my secrets are protected by a key separate from my login.

**Acceptance:**
- WHEN the user navigates to `/app/vault` for the first time in any workspace THE SYSTEM SHALL show a master-password setup screen.
- WHEN the user submits the new master password THE SYSTEM SHALL require minimum 12 characters and confirm via a second input field.
- THE SYSTEM SHALL reject the master password if it equals the user's login password (best-effort check via a fast comparison; not security-critical).
- WHEN the master password is set THE SYSTEM SHALL display a one-time warning that the password cannot be recovered, requiring an explicit confirmation checkbox before completing setup.
- THE SYSTEM SHALL never persist the master password itself; only an Argon2id verifier is stored (see DESIGN-CRYPTO-VAULT).

## REQ-VAULT-2 — Single master password across workspaces

**As a** user
**I want** to use the same master password across all my workspaces
**So that** I don't have to remember several.

**Acceptance:**
- WHEN the user sets up the vault in a second workspace THE SYSTEM SHALL prompt for the master password (rather than for a new one) and verify it against the existing verifier on the user.
- WHEN the master password matches THE SYSTEM SHALL provision a workspace-scoped vault using the per-workspace key derived from the master key (see DESIGN-CRYPTO-VAULT).
- THE SYSTEM SHALL not allow setting different master passwords per workspace (the per-user verifier is single).

## REQ-VAULT-3 — Unlock the vault

**As a** user
**I want** to unlock the vault by entering my master password
**So that** I can read and edit my secrets.

**Acceptance:**
- WHEN the user opens any vault page or a vault tool is invoked AND the vault is locked THE SYSTEM SHALL show an unlock prompt.
- WHEN the master password is entered correctly THE SYSTEM SHALL derive the master key and store it in server memory keyed by `(user_id, session_id)`.
- WHEN the master password is wrong THE SYSTEM SHALL respond with a generic failure (no information about which input was wrong) and apply rate limiting (max 5 attempts per minute per session).
- THE SYSTEM SHALL never log master password attempts.

## REQ-VAULT-4 — Auto-lock, manual lock, lock on logout

**Acceptance:**
- THE SYSTEM SHALL auto-lock the vault session after 30 minutes of vault-inactivity (no vault API calls). Activity in other features (KB, todos, etc.) does not extend the timer.
- THE SYSTEM SHALL provide a manual "Lock vault now" action accessible from the top nav lock icon and within `/app/vault`.
- WHEN the user logs out THE SYSTEM SHALL discard the in-memory master key.
- WHEN the server restarts THE SYSTEM SHALL not retain the master key (it lived only in memory).
- THE SYSTEM SHALL show the lock state in the top-nav icon at all times: closed padlock (locked) vs. open padlock (unlocked) with a tooltip showing remaining time until auto-lock.

## REQ-VAULT-5 — Change master password

**Acceptance:**
- THE SYSTEM SHALL allow changing the master password while the vault is unlocked.
- WHEN the master password changes THE SYSTEM SHALL re-encrypt all per-workspace key wrappers (not all entries — see DESIGN-CRYPTO-VAULT for the wrapping scheme).
- THE SYSTEM SHALL require entering the current master password to authorise the change.
- WHEN the change succeeds THE SYSTEM SHALL invalidate any other active vault sessions for the same user (re-unlock required there).

## REQ-VAULT-6 — Forgotten master password is unrecoverable

**Acceptance:**
- THE SYSTEM SHALL provide no recovery mechanism for a forgotten master password.
- THE SYSTEM SHALL provide a "Reset vault" action (separate from password reset) that, after a hard confirmation, deletes all vault entries in **all workspaces** for the user and lets the user start over with a new master password.
- THE SYSTEM SHALL clearly label the reset as destructive and irreversible.

## REQ-VAULT-7 — Create entries

**As a** user
**I want** to create vault entries with a title and optional standard and custom fields
**So that** I can store logins, tokens, SSH keys, and so on.

**Acceptance:**
- THE SYSTEM SHALL allow creating an entry with: title (required), username (optional), password (optional, secret), url (optional), notes (optional, multi-line, secret), folder (optional — defaults to root), tags (optional, multi).
- THE SYSTEM SHALL allow adding zero or more custom fields per entry, each with: name (required), value (required), `is_secret` flag (default `true`).
- THE SYSTEM SHALL store the username, password, url, notes, and all custom-field values encrypted; the title, folder, and tag associations are stored unencrypted (so search and folder navigation work without unlocking — see ADR-019 for the trade-off).
- WHEN creating an entry THE SYSTEM SHALL require the vault to be unlocked.

## REQ-VAULT-8 — Edit and delete entries

**Acceptance:**
- THE SYSTEM SHALL allow editing all fields of an entry while the vault is unlocked.
- THE SYSTEM SHALL soft-delete entries (`deleted_at`); a Trash view in the vault allows restore or permanent delete.
- THE SYSTEM SHALL allow duplicating an entry (creates a new entry with " (Copy)" suffix on the title).

## REQ-VAULT-9 — Folders

**As a** user
**I want** to organise entries into nested folders
**So that** I can mirror my mental model (Work / GitHub, Work / AWS, Personal / Banking, etc.).

**Acceptance:**
- THE SYSTEM SHALL support folders nested up to depth 5.
- THE SYSTEM SHALL allow moving an entry between folders.
- THE SYSTEM SHALL allow moving a folder (and its entries and sub-folders) under another folder.
- WHEN a folder is deleted while non-empty THE SYSTEM SHALL require confirmation and either move children to the parent folder or delete them, per the user's choice.

## REQ-VAULT-10 — Tags

**Acceptance:**
- THE SYSTEM SHALL allow assigning zero or more tags to an entry.
- THE SYSTEM SHALL store vault tags in a separate table (NOT shared with the v1 `kb_tags` table — see ADR-016).
- THE SYSTEM SHALL allow filtering the entry list by tag.

## REQ-VAULT-11 — Search

**Acceptance:**
- THE SYSTEM SHALL support search across the title field only (titles are stored unencrypted, so this works whether or not the vault is unlocked from a tech standpoint, but the UI requires an unlocked vault to display results — see ADR-019).
- THE SYSTEM SHALL support filtering search results by folder and tag.
- THE SYSTEM SHALL not search inside encrypted fields. This is a deliberate trade-off documented in ADR-019.

## REQ-VAULT-12 — Copy values to clipboard

**Acceptance:**
- THE SYSTEM SHALL provide one-click copy buttons for username, password, and any secret custom field.
- WHEN a secret is copied THE SYSTEM SHALL clear the clipboard automatically after 30 seconds (using `navigator.clipboard.write` followed by a delayed clear — best-effort; document limitations in code comments).
- THE SYSTEM SHALL never display the password in plaintext by default; a click "reveal" toggles plaintext display.
- THE SYSTEM SHALL provide a copy button for the entire SSH-key textarea content (typical for `~/.ssh/id_rsa` workflows).

## REQ-VAULT-13 — Workspace isolation

**Acceptance:**
- THE SYSTEM SHALL store every vault entry, folder, and tag scoped by `organisation_id`.
- THE SYSTEM SHALL never decrypt an entry from one workspace using another workspace's key, even if the master key is in memory.
- THE SYSTEM SHALL provide no UI affordance to move or copy entries between workspaces.

## REQ-VAULT-14 — Orchestrator search (read, metadata only)

**As a** user
**I want** the orchestrator to find vault entries by title, URL, folder, or tag
**So that** I can ask "do I have an entry for the deploy server" without leaving chat.

**Acceptance:**
- THE SYSTEM SHALL expose a `vault_search` tool to the orchestrator with parameters: `query?`, `folder?`, `tags?`.
- THE SYSTEM SHALL return only metadata: id, title, folder path, tags, has_username (bool), has_password (bool), has_custom_fields (bool). No values, ever.
- WHEN the vault is locked AND the orchestrator calls `vault_search` THE SYSTEM SHALL return an error result `{"error": "vault_locked"}` and emit a UI event prompting the user to unlock; the orchestrator SHALL surface this to the user as plain text rather than retrying.
- THE SYSTEM SHALL log every `vault_search` call to the orchestrator audit log with `meta.vault_access = true`.

## REQ-VAULT-15 — Orchestrator reveal (read, plaintext, confirmation required)

**Acceptance:**
- THE SYSTEM SHALL expose a `vault_get_secret` tool to the orchestrator with parameters: `entry_id`, `field` (one of: `password`, `username`, `notes`, or a custom-field name), `reason` (free-text string the orchestrator must supply explaining why it needs the secret).
- THE SYSTEM SHALL classify this tool as `confirm` (always requires user confirmation in the chat UI).
- WHEN the user confirms THE SYSTEM SHALL return the plaintext value to the orchestrator (which forwards it to the LLM provider via the next API call).
- THE SYSTEM SHALL log every `vault_get_secret` call (whether confirmed or cancelled) with `meta.vault_access = true` and store the supplied `reason` in the audit log.
- THE SYSTEM SHALL render the confirmation card with a clearly visible warning: "The secret will be sent to the LLM provider. Confirm only if necessary."

## REQ-VAULT-16 — No write tools for orchestrator

**Acceptance:**
- THE SYSTEM SHALL not expose any write tool for vault entries to the orchestrator. Creating, editing, or deleting vault entries is reserved to direct user action.
- THE SYSTEM SHALL not register vault write tools even when the conversation is in `read_write` mode.

## REQ-VAULT-17 — Permissions

**Acceptance:**
- THE SYSTEM SHALL define new permissions: `vault:read`, `vault:write`, `vault:delete`, `vault:orchestrator:reveal` (the last gates whether the orchestrator's `vault_get_secret` tool is registered for the user).
- THE SYSTEM SHALL assign `vault:read|write|delete` to Owner and Member roles by default. `vault:orchestrator:reveal` defaults to Owner only.
- THE SYSTEM SHALL refuse all vault API requests when the caller lacks `vault:read`.

## REQ-VAULT-18 — Audit log surfacing

**Acceptance:**
- THE SYSTEM SHALL include vault access events in the existing orchestrator audit log (`orchestrator_actions`) with `meta.vault_access = true`.
- THE SYSTEM SHALL provide a filter in the audit log UI to show only vault access events.
- THE SYSTEM SHALL provide a separate vault-access view (`/app/vault/audit`) for users with `vault:read` showing the same events filtered, including non-orchestrator vault access (e.g. direct UI reveals — see REQ-VAULT-19).

## REQ-VAULT-19 — Direct UI reveals are also audited

**Acceptance:**
- WHEN the user clicks "reveal" on a password field in the UI THE SYSTEM SHALL log this event (entry id, field name, timestamp) to a dedicated `vault_access_log` table.
- THE SYSTEM SHALL not require a reason for direct UI reveals (it's the user themselves), but the log entry SHALL distinguish UI reveals from orchestrator reveals.

## REQ-VAULT-20 — Password generator (optional helper)

**As a** user
**I want** a built-in password generator
**So that** I don't reach for an external tool when creating an entry.

**Acceptance:**
- THE SYSTEM SHALL provide a generator button next to the password field on entry create/edit.
- THE SYSTEM SHALL allow configuring length (default 24), and toggling: lowercase, uppercase, digits, symbols.
- THE SYSTEM SHALL use `crypto.getRandomValues` (browser-native CSPRNG); no server round-trip.
