import { pgTable, text, timestamp } from 'drizzle-orm/pg-core'
import { organisations } from './organisations'

export const teams = pgTable('teams', {
  id: text('id').primaryKey(), // ULID
  name: text('name').notNull(),
  organisationId: text('organisation_id').notNull().references(() => organisations.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export type Team = typeof teams.$inferSelect
export type NewTeam = typeof teams.$inferInsert
