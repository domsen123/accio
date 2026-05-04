import { boolean, index, pgTable, text, timestamp } from 'drizzle-orm/pg-core'
import { kbEntries } from './kb-entries'
import { organisations } from './organisations'

// Wikilink edges materialised on entry save (DESIGN-WIKILINKS).
// `to_entry_id` is nullable when the target slug does not yet resolve to an
// entry in the same workspace. We keep `to_slug` even when resolved so that
// renaming the target later does not break historic references.
//
// `organisation_id` is denormalised here so unresolved links can still be
// queried per workspace (per task spec).
export const kbEntryLinks = pgTable('kb_entry_links', {
  id: text('id').primaryKey(), // ULID
  organisationId: text('organisation_id').notNull().references(() => organisations.id, { onDelete: 'cascade' }),
  fromEntryId: text('from_entry_id').notNull().references(() => kbEntries.id, { onDelete: 'cascade' }),
  toEntryId: text('to_entry_id').references(() => kbEntries.id, { onDelete: 'set null' }),
  toSlug: text('to_slug').notNull(),
  resolved: boolean('resolved').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, table => [
  index('kb_entry_links_from_idx').on(table.fromEntryId),
  index('kb_entry_links_to_entry_idx').on(table.toEntryId),
  index('kb_entry_links_org_to_slug_idx').on(table.organisationId, table.toSlug),
])

export type KbEntryLink = typeof kbEntryLinks.$inferSelect
export type NewKbEntryLink = typeof kbEntryLinks.$inferInsert
