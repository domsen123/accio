import { pgEnum, pgTable, text, timestamp } from 'drizzle-orm/pg-core'
import { aiModels } from './ai-models'
import { organisations } from './organisations'
import { users } from './users'

// Conversation `mode` controls which tools are exposed to the model:
// `read_only` -> read tools only; `read_write` -> read + write (DESIGN-TOOLS,
// DESIGN-CHAT step 2).
export const orchestratorConversationMode = pgEnum('orchestrator_conversation_mode', [
  'read_only',
  'read_write',
])

// Orchestrator conversations. See DESIGN-DATA §Orchestrator, REQ-ORCH-1..6.
//
// `model_id` (nullable) pins a specific model. Resolution order at request time
// (DESIGN-AI §Provider-Model resolution flow):
//   conversation.model_id -> workspace.default_model_id -> ai_models WHERE is_default=true
// FK uses ON DELETE SET NULL so deprecating a model never cascades into history.
//
// Soft delete via `deleted_at` (ADR-009).
export const orchestratorConversations = pgTable('orchestrator_conversations', {
  id: text('id').primaryKey(), // ULID
  organisationId: text('organisation_id').notNull().references(() => organisations.id, { onDelete: 'cascade' }),
  userId: text('user_id').references(() => users.id, { onDelete: 'set null' }),
  title: text('title').notNull().default(''),
  mode: orchestratorConversationMode('mode').notNull().default('read_only'),
  modelId: text('model_id').references(() => aiModels.id, { onDelete: 'set null' }),
  systemPrompt: text('system_prompt'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
})

export type OrchestratorConversation = typeof orchestratorConversations.$inferSelect
export type NewOrchestratorConversation = typeof orchestratorConversations.$inferInsert
