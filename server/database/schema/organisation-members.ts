import { pgTable, text, timestamp, unique } from 'drizzle-orm/pg-core'
import { organisations } from './organisations'
import { users } from './users'

export const organisationMembers = pgTable('organisation_members', {
  id: text('id').primaryKey(), // ULID
  organisationId: text('organisation_id').notNull().references(() => organisations.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, table => [
  unique().on(table.organisationId, table.userId),
])

export type OrganisationMember = typeof organisationMembers.$inferSelect
export type NewOrganisationMember = typeof organisationMembers.$inferInsert
