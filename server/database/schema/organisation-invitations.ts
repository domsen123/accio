import { pgTable, text, timestamp, unique } from 'drizzle-orm/pg-core'
import { organisations } from './organisations'
import { roles } from './roles'

export const organisationInvitations = pgTable('organisation_invitations', {
  id: text('id').primaryKey(), // ULID
  token: text('token').notNull().unique(), // 64-char hex token
  email: text('email').notNull(),
  organisationId: text('organisation_id').notNull().references(() => organisations.id, { onDelete: 'cascade' }),
  roleId: text('role_id').notNull().references(() => roles.id, { onDelete: 'cascade' }),
  invitedByUserId: text('invited_by_user_id').notNull(), // No FK to allow admin deletion
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, table => [
  unique().on(table.email, table.organisationId), // Prevent duplicate invitations
])

export type OrganisationInvitation = typeof organisationInvitations.$inferSelect
export type NewOrganisationInvitation = typeof organisationInvitations.$inferInsert
