import { pgTable, text, timestamp } from 'drizzle-orm/pg-core'
import { users } from './users'

export const pendingEmailChanges = pgTable('pending_email_changes', {
  id: text('id').primaryKey(), // ULID
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  newEmail: text('new_email').notNull(),
  token: text('token').notNull().unique(), // 64-char hex token
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export type PendingEmailChange = typeof pendingEmailChanges.$inferSelect
export type NewPendingEmailChange = typeof pendingEmailChanges.$inferInsert
