import { pgTable, text, timestamp, unique } from 'drizzle-orm/pg-core'
import { teams } from './teams'
import { users } from './users'

export const teamMembers = pgTable('team_members', {
  id: text('id').primaryKey(), // ULID
  teamId: text('team_id').notNull().references(() => teams.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, table => [
  unique().on(table.teamId, table.userId),
])

export type TeamMember = typeof teamMembers.$inferSelect
export type NewTeamMember = typeof teamMembers.$inferInsert
