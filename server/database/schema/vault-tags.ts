import { sql } from 'drizzle-orm'
import { pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core'
import { organisations } from './organisations'

// Vault tags (DESIGN-VAULT-DATA, REQ-VAULT-10).
//
// Stored in a dedicated table — NOT shared with `kb_tags` per REQ-VAULT-10
// and the implicit ADR-016 reference, since vault tag visibility must follow
// `vault:read` rather than `kb:read`.
//
// Tag names are unique per workspace, case-insensitive — same uniqueIndex
// pattern as `kb_tags`.
export const vaultTags = pgTable('vault_tags', {
  id: text('id').primaryKey(), // ULID
  organisationId: text('organisation_id').notNull().references(() => organisations.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, table => [
  uniqueIndex('vault_tags_org_name_lower_unique').on(table.organisationId, sql`lower(${table.name})`),
])

export type VaultTag = typeof vaultTags.$inferSelect
export type NewVaultTag = typeof vaultTags.$inferInsert
