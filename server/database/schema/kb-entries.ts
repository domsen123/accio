import { sql } from 'drizzle-orm'
import { customType, index, pgEnum, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core'
import { kbCategories } from './kb-categories'
import { organisations } from './organisations'
import { users } from './users'

// Postgres enums for KB entries.
// See DESIGN-DATA §KB, ADR-007 (AI may write to KB), README glossary.
export const kbEntryStatus = pgEnum('kb_entry_status', ['inbox', 'draft', 'verified', 'archived'])
export const kbEntryAuthorType = pgEnum('kb_entry_author_type', ['human', 'ai'])
export const kbEntrySourceType = pgEnum('kb_entry_source_type', [
  'manual',
  'commit',
  'claude_code_session',
  'chat',
  'external',
])

// Drizzle has no first-class tsvector type. Define one via customType.
// The column itself is generated in the DB via `generatedAlwaysAs(...)` below.
const tsvector = customType<{ data: string, driverData: string }>({
  dataType: () => 'tsvector',
})

// Knowledge Base entries. Markdown body with an FTS-generated `body_search`
// tsvector (REQ-KB-5, DESIGN-RANK). Title is weighted A, body B, both via the
// `simple` config for locale portability.
//
// `status` defaults to 'draft' for human writes; service layer overrides to
// 'inbox' for AI-authored entries (ADR-007).
export const kbEntries = pgTable('kb_entries', {
  id: text('id').primaryKey(), // ULID
  organisationId: text('organisation_id').notNull().references(() => organisations.id, { onDelete: 'cascade' }),
  slug: text('slug').notNull(),
  title: text('title').notNull(),
  bodyMd: text('body_md').notNull().default(''),
  bodySearch: tsvector('body_search').generatedAlwaysAs(
    (): any => sql`setweight(to_tsvector('simple', coalesce(${kbEntries.title}, '')), 'A') || setweight(to_tsvector('simple', coalesce(${kbEntries.bodyMd}, '')), 'B')`,
  ),
  categoryId: text('category_id').references(() => kbCategories.id, { onDelete: 'set null' }),
  status: kbEntryStatus('status').notNull().default('draft'),
  authorType: kbEntryAuthorType('author_type').notNull().default('human'),
  authorName: text('author_name').notNull().default(''),
  sourceType: kbEntrySourceType('source_type').notNull().default('manual'),
  sourceRef: text('source_ref'),
  createdBy: text('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
}, table => [
  uniqueIndex('kb_entries_org_slug_unique').on(table.organisationId, table.slug),
  index('kb_entries_org_status_idx').on(table.organisationId, table.status),
  index('kb_entries_org_category_idx').on(table.organisationId, table.categoryId),
  index('kb_entries_body_search_gin').using('gin', table.bodySearch),
])

export type KbEntry = typeof kbEntries.$inferSelect
export type NewKbEntry = typeof kbEntries.$inferInsert
