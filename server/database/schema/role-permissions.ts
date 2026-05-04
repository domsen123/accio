import { pgTable, text, timestamp, unique } from 'drizzle-orm/pg-core'
import { roles } from './roles'

export const rolePermissions = pgTable('role_permissions', {
  id: text('id').primaryKey(), // ULID
  roleId: text('role_id').notNull().references(() => roles.id, { onDelete: 'cascade' }),
  permission: text('permission').notNull(), // References hardcoded permission code from permissions.ts
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, table => [
  unique().on(table.roleId, table.permission),
])

export type RolePermission = typeof rolePermissions.$inferSelect
export type NewRolePermission = typeof rolePermissions.$inferInsert
