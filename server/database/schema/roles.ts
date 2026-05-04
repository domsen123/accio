import { boolean, pgTable, text, timestamp } from 'drizzle-orm/pg-core'
import { organisations } from './organisations'

export const roles = pgTable('roles', {
  id: text('id').primaryKey(), // ULID
  name: text('name').notNull(),
  description: text('description'),
  scope: text('scope').notNull(), // 'global' | 'organisation' | 'team' | ...
  isSystem: boolean('is_system').notNull().default(false), // System roles cannot be modified/deleted
  isDefault: boolean('is_default').notNull().default(false), // Default role for new members in scope
  // For custom org-specific roles - null means system-wide role
  organisationId: text('organisation_id').references(() => organisations.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export type Role = typeof roles.$inferSelect
export type NewRole = typeof roles.$inferInsert
