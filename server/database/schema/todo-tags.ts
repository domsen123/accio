import { pgTable, primaryKey, text, timestamp } from 'drizzle-orm/pg-core'
import { kbTags } from './kb-tags'
import { todos } from './todos'

// Junction table between todos and kb_tags (ADR-008, DESIGN-DATA §Todo).
// Tags are first-class rows in `kb_tags` and reused for todos — no separate
// todo-tag table. Composite PK on (todo_id, tag_id). Both FKs cascade on
// delete so todo/tag deletions clean up the junction.
export const todoTags = pgTable('todo_tags', {
  todoId: text('todo_id').notNull().references(() => todos.id, { onDelete: 'cascade' }),
  tagId: text('tag_id').notNull().references(() => kbTags.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, table => [
  primaryKey({ columns: [table.todoId, table.tagId] }),
])

export type TodoTag = typeof todoTags.$inferSelect
export type NewTodoTag = typeof todoTags.$inferInsert
