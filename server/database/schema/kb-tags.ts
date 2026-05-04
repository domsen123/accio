import { sql } from 'drizzle-orm'
import { pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core'
import { organisations } from './organisations'

// Knowledge Base tags. First-class rows (ADR-008).
// Reused by todos via `todo_tags` (DESIGN-DATA).
// Tag names are unique per workspace, case-insensitive — enforced via a
// uniqueIndex over (organisation_id, lower(name)).
export const kbTags = pgTable('kb_tags', {
  id: text('id').primaryKey(), // ULID
  organisationId: text('organisation_id').notNull().references(() => organisations.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
}, table => [
  uniqueIndex('kb_tags_org_name_lower_unique').on(table.organisationId, sql`lower(${table.name})`),
])

export type KbTag = typeof kbTags.$inferSelect
export type NewKbTag = typeof kbTags.$inferInsert
