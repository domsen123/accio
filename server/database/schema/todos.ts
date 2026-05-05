import type { AnyPgColumn } from 'drizzle-orm/pg-core'
import { index, pgEnum, pgTable, text, timestamp } from 'drizzle-orm/pg-core'
import { organisations } from './organisations'
import { users } from './users'

// Todo priority enum (DESIGN-DATA §Todo).
export const todoPriority = pgEnum('todo_priority', ['low', 'medium', 'high', 'urgent'])

// Todos. See DESIGN-DATA §Todo, REQ-TODO-1..4.
//
// Subtasks: `parent_todo_id` is a self-FK with ON DELETE CASCADE so deleting a
// parent removes its descendants. The depth-3 invariant (REQ-TODO-2) is
// enforced in the service layer (T-2.2), NOT via DB constraints — Postgres
// has no native max-depth check on a recursive self-FK, and a CHECK using a
// subquery would not be sound under concurrent inserts.
//
// Soft delete via `deleted_at` (ADR-009). Tag-set is reused from `kb_tags`
// via `todo_tags` (ADR-008). KB cross-references via `todo_kb_links`.
export const todos = pgTable('todos', {
  id: text('id').primaryKey(), // ULID
  organisationId: text('organisation_id').notNull().references(() => organisations.id, { onDelete: 'cascade' }),
  parentTodoId: text('parent_todo_id').references((): AnyPgColumn => todos.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  descriptionMd: text('description_md'),
  priority: todoPriority('priority').notNull().default('medium'),
  dueAt: timestamp('due_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  createdBy: text('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
}, table => [
  index('todos_org_completed_at_idx').on(table.organisationId, table.completedAt),
  index('todos_org_due_at_idx').on(table.organisationId, table.dueAt),
  index('todos_parent_idx').on(table.parentTodoId),
])

export type Todo = typeof todos.$inferSelect
export type NewTodo = typeof todos.$inferInsert
