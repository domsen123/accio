import { pgTable, text, timestamp } from 'drizzle-orm/pg-core'

export const organisations = pgTable('organisations', {
  id: text('id').primaryKey(), // ULID
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  // Per-organisation HKDF salt used by encryptForOrg / decryptForOrg (see DESIGN-CRYPTO).
  // 16 random bytes encoded as 32 hex chars. Generated on org creation; never null going forward.
  cryptoSalt: text('crypto_salt').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export type Organisation = typeof organisations.$inferSelect
export type NewOrganisation = typeof organisations.$inferInsert
