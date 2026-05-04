import { pgTable, primaryKey, text, timestamp } from 'drizzle-orm/pg-core'
import { kbEntries } from './kb-entries'
import { kbTags } from './kb-tags'

// Junction table between kb_entries and kb_tags (ADR-008).
// Composite PK on (entry_id, tag_id) per DESIGN-DATA §KB.
// Both FKs cascade on delete so tag/entry deletions clean up the junction.
export const kbEntryTags = pgTable('kb_entry_tags', {
  entryId: text('entry_id').notNull().references(() => kbEntries.id, { onDelete: 'cascade' }),
  tagId: text('tag_id').notNull().references(() => kbTags.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, table => [
  primaryKey({ columns: [table.entryId, table.tagId] }),
])

export type KbEntryTag = typeof kbEntryTags.$inferSelect
export type NewKbEntryTag = typeof kbEntryTags.$inferInsert
