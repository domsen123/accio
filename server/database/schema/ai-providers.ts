import { boolean, pgTable, text, timestamp } from 'drizzle-orm/pg-core'

// Global registry of supported AI providers (Anthropic, OpenAI, Google, ...).
// See DESIGN-DATA §AI Provider, ADR-013, ADR-014. Platform-global; no soft delete.
export const aiProviders = pgTable('ai_providers', {
  id: text('id').primaryKey(), // ULID
  // Stable lookup key, e.g. `anthropic`, `openai`, `google`.
  key: text('key').notNull().unique(),
  // Human-readable label for UI.
  displayName: text('display_name').notNull(),
  // Vercel AI SDK provider identifier (matches the package id, e.g. `anthropic`).
  sdkProviderId: text('sdk_provider_id').notNull(),
  // Allows admins to disable a provider globally without deleting it.
  enabled: boolean('enabled').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export type AiProvider = typeof aiProviders.$inferSelect
export type NewAiProvider = typeof aiProviders.$inferInsert
