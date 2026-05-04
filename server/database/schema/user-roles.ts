import { pgTable, text, timestamp, unique } from 'drizzle-orm/pg-core'
import { roles } from './roles'
import { users } from './users'

/**
 * Polymorphic user role assignments.
 * A single table handles all scope types (global, organisation, team, etc.)
 *
 * Examples:
 * - Global role: scope='global', scopeId=null
 * - Org role: scope='organisation', scopeId=<orgId>
 * - Team role: scope='team', scopeId=<teamId>
 * - Future: scope='project', scopeId=<projectId>
 */
export const userRoles = pgTable('user_roles', {
  id: text('id').primaryKey(), // ULID
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  roleId: text('role_id').notNull().references(() => roles.id, { onDelete: 'cascade' }),
  scope: text('scope').notNull(), // 'global' | 'organisation' | 'team' | ...
  scopeId: text('scope_id'), // null for global, orgId/teamId/etc. for scoped roles
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, table => [
  unique().on(table.userId, table.roleId, table.scope, table.scopeId),
])

export type UserRole = typeof userRoles.$inferSelect
export type NewUserRole = typeof userRoles.$inferInsert
