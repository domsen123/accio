import { boolean, index, integer, numeric, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core'
import { aiProviders } from './ai-providers'

// Selectable AI models per provider. See DESIGN-DATA §AI Provider, DESIGN-AI §Capability validation.
//
// Capability flags (`supports_tools`, `supports_streaming`, `supports_vision`) gate
// whether a model is eligible for the orchestrator (REQ-AI-2). Prices are nullable
// for cost tracking (T-NTH-5).
//
// `is_default`: exactly one row may have this true; used as the system-wide fallback
// when neither the conversation nor the workspace pins a model.
//
// `enabled`: deprecated models stay around (audit log keeps FKs) but are hidden from
// the picker. No soft-delete column — the audit log requires the row to remain.
export const aiModels = pgTable('ai_models', {
  id: text('id').primaryKey(), // ULID
  providerId: text('provider_id').notNull().references(() => aiProviders.id, { onDelete: 'cascade' }),
  // Provider-side identifier, e.g. `claude-sonnet-4-5`, `gpt-4o`, `gemini-2.5-pro`.
  modelId: text('model_id').notNull(),
  displayName: text('display_name').notNull(),
  contextWindow: integer('context_window').notNull(),
  supportsTools: boolean('supports_tools').notNull().default(false),
  supportsStreaming: boolean('supports_streaming').notNull().default(false),
  supportsVision: boolean('supports_vision').notNull().default(false),
  inputPricePerMtok: numeric('input_price_per_mtok', { precision: 10, scale: 4 }),
  outputPricePerMtok: numeric('output_price_per_mtok', { precision: 10, scale: 4 }),
  enabled: boolean('enabled').notNull().default(true),
  isDefault: boolean('is_default').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, table => [
  uniqueIndex('ai_models_provider_model_unique').on(table.providerId, table.modelId),
  index('ai_models_provider_default_idx').on(table.providerId, table.isDefault),
])

export type AiModel = typeof aiModels.$inferSelect
export type NewAiModel = typeof aiModels.$inferInsert
