import { pgTable, primaryKey, text, timestamp } from 'drizzle-orm/pg-core'
import { vaultEntries } from './vault-entries'
import { vaultTags } from './vault-tags'

// Junction table between vault_entries and vault_tags (DESIGN-VAULT-DATA).
// Composite PK on (entry_id, tag_id). Both FKs cascade on delete so
// removing a tag or entry cleans up the junction.
export const vaultEntryTags = pgTable('vault_entry_tags', {
  entryId: text('entry_id').notNull().references(() => vaultEntries.id, { onDelete: 'cascade' }),
  tagId: text('tag_id').notNull().references(() => vaultTags.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, table => [
  primaryKey({ columns: [table.entryId, table.tagId] }),
])

export type VaultEntryTag = typeof vaultEntryTags.$inferSelect
export type NewVaultEntryTag = typeof vaultEntryTags.$inferInsert
