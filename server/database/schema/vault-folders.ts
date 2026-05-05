import type { AnyPgColumn } from 'drizzle-orm/pg-core'
import { index, pgTable, text, timestamp } from 'drizzle-orm/pg-core'
import { organisations } from './organisations'

// Vault folders form a KeePass-style tree (DESIGN-VAULT-DATA, REQ-VAULT-9).
//
// Hierarchical via self-FK `parent_id`. The 5-level depth limit is enforced
// in the service layer (REQ-VAULT-9, T-V-15) — Postgres has no native check.
//
// `parent_id` ON DELETE SET NULL so deleting a parent re-parents its children
// to the root rather than cascading the data loss; the service layer offers
// `delete_recursive` as an opt-in alternative.
export const vaultFolders = pgTable('vault_folders', {
  id: text('id').primaryKey(), // ULID
  organisationId: text('organisation_id').notNull().references(() => organisations.id, { onDelete: 'cascade' }),
  parentId: text('parent_id').references((): AnyPgColumn => vaultFolders.id, { onDelete: 'set null' }),
  name: text('name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
}, table => [
  index('vault_folders_org_parent_idx').on(table.organisationId, table.parentId),
])

export type VaultFolder = typeof vaultFolders.$inferSelect
export type NewVaultFolder = typeof vaultFolders.$inferInsert
