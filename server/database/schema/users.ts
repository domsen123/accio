import { boolean, pgTable, text, timestamp, varchar } from 'drizzle-orm/pg-core'

export const users = pgTable('users', {
  id: text('id').primaryKey(), // ULID
  email: text('email').unique(),
  passwordHash: text('password_hash'),
  name: text('name'),
  authProvider: text('auth_provider').notNull().default('credentials'),
  emailVerified: boolean('email_verified').notNull().default(false),
  // Per-user UI language preference; one of the locales configured in nuxt.config.ts (default 'de')
  locale: varchar('locale', { length: 8 }).notNull().default('de'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export type User = typeof users.$inferSelect
export type NewUser = typeof users.$inferInsert
