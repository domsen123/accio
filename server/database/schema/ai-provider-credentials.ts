import { pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core'
import { aiProviders } from './ai-providers'
import { organisations } from './organisations'
import { users } from './users'

// Per-workspace API keys for AI providers. See DESIGN-DATA §AI Provider,
// DESIGN-CRYPTO, ADR-014.
//
// `api_key_encrypted` stores the AES-256-GCM blob produced by `encryptForOrg`
// (T-0.6). Plaintext never leaves request scope; see DESIGN-AI for the
// resolution flow.
//
// `base_url` (nullable) overrides the default endpoint for OpenAI-compatible
// providers (e.g. local Ollama, OpenRouter).
//
// One credential per (organisation, provider) — enforced via unique index.
export const aiProviderCredentials = pgTable('ai_provider_credentials', {
  id: text('id').primaryKey(), // ULID
  organisationId: text('organisation_id').notNull().references(() => organisations.id, { onDelete: 'cascade' }),
  providerId: text('provider_id').notNull().references(() => aiProviders.id, { onDelete: 'cascade' }),
  apiKeyEncrypted: text('api_key_encrypted').notNull(),
  baseUrl: text('base_url'),
  createdBy: text('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, table => [
  uniqueIndex('ai_provider_credentials_org_provider_unique').on(table.organisationId, table.providerId),
])

export type AiProviderCredential = typeof aiProviderCredentials.$inferSelect
export type NewAiProviderCredential = typeof aiProviderCredentials.$inferInsert
