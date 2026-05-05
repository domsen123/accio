import { index, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core'
import { organisations } from './organisations'
import { users } from './users'
import { vaultFolders } from './vault-folders'

// Vault entries (DESIGN-VAULT-DATA, REQ-VAULT-7..8).
//
// `title` is plaintext intentionally so list/search/breadcrumb views render
// without an unlocked vault (ADR-019). Everything sensitive — username,
// password, url, notes, custom fields — lives inside the encrypted `payload`
// blob (DESIGN-VAULT-CRYPTO §field-level).
//
// `created_by` ON DELETE SET NULL so leaving the workspace doesn't shred the
// vault entry. Soft delete via `deleted_at` (ADR-009); Trash UI can hard
// delete.
export const vaultEntries = pgTable('vault_entries', {
  id: text('id').primaryKey(), // ULID
  organisationId: text('organisation_id').notNull().references(() => organisations.id, { onDelete: 'cascade' }),
  folderId: text('folder_id').references(() => vaultFolders.id, { onDelete: 'set null' }),
  title: text('title').notNull(),
  payload: jsonb('payload').notNull(),
  createdBy: text('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
}, table => [
  index('vault_entries_org_folder_idx').on(table.organisationId, table.folderId),
  index('vault_entries_org_deleted_idx').on(table.organisationId, table.deletedAt),
])

export type VaultEntry = typeof vaultEntries.$inferSelect
export type NewVaultEntry = typeof vaultEntries.$inferInsert
