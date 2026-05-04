import type { AnyPgColumn } from 'drizzle-orm/pg-core'
import { pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core'
import { organisations } from './organisations'

// Knowledge Base categories.
// Hierarchical via self-FK `parent_id`. Slug is unique per organisation.
// See DESIGN-DATA §KB and ADR-001.
export const kbCategories = pgTable('kb_categories', {
  id: text('id').primaryKey(), // ULID
  organisationId: text('organisation_id').notNull().references(() => organisations.id, { onDelete: 'cascade' }),
  parentId: text('parent_id').references((): AnyPgColumn => kbCategories.id, { onDelete: 'set null' }),
  name: text('name').notNull(),
  slug: text('slug').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
}, table => [
  uniqueIndex('kb_categories_org_slug_unique').on(table.organisationId, table.slug),
])

export type KbCategory = typeof kbCategories.$inferSelect
export type NewKbCategory = typeof kbCategories.$inferInsert
