import { boolean, pgTable, text, timestamp } from 'drizzle-orm/pg-core'

export const contentCreatorSettings = pgTable('content_creator_settings', {
  id: text('id').primaryKey(), // ULID
  provider: text('provider').notNull(), // 'anthropic' | 'google'
  model: text('model'), // nullable -- null means use provider default
  apiKeyEncrypted: text('api_key_encrypted').notNull(),
  apiKeyIv: text('api_key_iv').notNull(),
  apiKeyTag: text('api_key_tag').notNull(),
  brandVoice: text('brand_voice'),
  language: text('language').notNull().default('en'),
  productionInterval: text('production_interval').notNull().default('weekly'), // 'every3days' | 'weekly' | 'biweekly'
  productionEnabled: boolean('production_enabled').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export type ContentCreatorSettings = typeof contentCreatorSettings.$inferSelect
export type NewContentCreatorSettings = typeof contentCreatorSettings.$inferInsert
