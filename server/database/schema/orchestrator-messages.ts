import { index, jsonb, pgEnum, pgTable, text, timestamp } from 'drizzle-orm/pg-core'
import { orchestratorConversations } from './orchestrator-conversations'

// Message roles per DESIGN-DATA §Orchestrator. `tool_result` covers tool-call
// responses (assistant tool invocations themselves are encoded inside the
// assistant message's structured `content` blocks).
export const orchestratorMessageRole = pgEnum('orchestrator_message_role', [
  'user',
  'assistant',
  'tool_result',
])

// Orchestrator messages — immutable conversation history.
//
// `content` is jsonb to hold structured content blocks (text, tool_use,
// tool_result) per the Vercel AI SDK / Anthropic message shape. No soft delete —
// messages are an append-only audit log; the parent conversation owns deletion.
//
// Index on (conversation_id, created_at) for the windowed history fetch
// described in DESIGN-CHAT step 2.
export const orchestratorMessages = pgTable('orchestrator_messages', {
  id: text('id').primaryKey(), // ULID
  conversationId: text('conversation_id').notNull().references(() => orchestratorConversations.id, { onDelete: 'cascade' }),
  role: orchestratorMessageRole('role').notNull(),
  content: jsonb('content').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, table => [
  index('orchestrator_messages_conversation_idx').on(table.conversationId, table.createdAt),
])

export type OrchestratorMessage = typeof orchestratorMessages.$inferSelect
export type NewOrchestratorMessage = typeof orchestratorMessages.$inferInsert
