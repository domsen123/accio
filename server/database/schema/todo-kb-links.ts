import { pgTable, primaryKey, text, timestamp } from 'drizzle-orm/pg-core'
import { kbEntries } from './kb-entries'
import { todos } from './todos'

// Junction table linking todos to KB entries (REQ-TODO-3, DESIGN-DATA §Todo).
// Many-to-many: a todo may reference multiple KB entries and vice versa.
// Composite PK on (todo_id, entry_id). Both FKs cascade on delete so a hard
// delete of either side cleans up the link rows. Soft-deleted todos / entries
// keep their links (filtering happens in the service layer).
export const todoKbLinks = pgTable('todo_kb_links', {
  todoId: text('todo_id').notNull().references(() => todos.id, { onDelete: 'cascade' }),
  entryId: text('entry_id').notNull().references(() => kbEntries.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, table => [
  primaryKey({ columns: [table.todoId, table.entryId] }),
])

export type TodoKbLink = typeof todoKbLinks.$inferSelect
export type NewTodoKbLink = typeof todoKbLinks.$inferInsert
