import { pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core'
import { bytea } from './column-types'
import { organisations } from './organisations'

// Per-workspace data encryption key, wrapped under the user's master key
// (DESIGN-VAULT-DATA, DESIGN-VAULT-CRYPTO §Wrapping).
//
// One row per workspace: the same workspace shares its DEK across all users
// who can access the workspace's vault. `workspace_salt` is the HKDF salt
// used to derive a workspace-scoped key from the master key, which then
// AES-256-GCM-decrypts `wrapped_dek` using `wrap_iv` / `wrap_tag`.
export const workspaceVaultKeys = pgTable('workspace_vault_keys', {
  id: text('id').primaryKey(), // ULID
  organisationId: text('organisation_id').notNull().references(() => organisations.id, { onDelete: 'cascade' }),
  workspaceSalt: bytea('workspace_salt').notNull(),
  wrappedDek: bytea('wrapped_dek').notNull(),
  wrapIv: bytea('wrap_iv').notNull(),
  wrapTag: bytea('wrap_tag').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, table => [
  uniqueIndex('workspace_vault_keys_org_unique').on(table.organisationId),
])

export type WorkspaceVaultKey = typeof workspaceVaultKeys.$inferSelect
export type NewWorkspaceVaultKey = typeof workspaceVaultKeys.$inferInsert
