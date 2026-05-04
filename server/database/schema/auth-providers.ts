import { boolean, integer, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core'

export const authProviders = pgTable('auth_providers', {
  id: text('id').primaryKey(), // ULID
  provider: text('provider').notNull().unique(),
  enabled: boolean('enabled').notNull().default(false),
  config: jsonb('config').notNull().default({}),
  displayOrder: integer('display_order').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export type AuthProvider = typeof authProviders.$inferSelect
export type NewAuthProvider = typeof authProviders.$inferInsert
