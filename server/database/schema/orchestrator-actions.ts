import { index, integer, jsonb, pgEnum, pgTable, text, timestamp } from 'drizzle-orm/pg-core'
import { aiModels } from './ai-models'
import { orchestratorConversations } from './orchestrator-conversations'
import { orchestratorMessages } from './orchestrator-messages'
import { organisations } from './organisations'
import { users } from './users'

// `auto` -> tool executes immediately on model request.
// `confirm` -> tool requires explicit user approval before execution
// (DESIGN-CONF, ADR-010). Class is captured per-action so the bulk-rule
// promotion (>=6 affected entities) is recorded alongside the base class.
export const orchestratorActionClass = pgEnum('orchestrator_action_class', [
  'auto',
  'confirm',
])

// Lifecycle states for an action row. `pending_confirmation` is the parked
// state between the model's tool request and the user's confirm/cancel
// (DESIGN-CHAT step 4). `confirmed` is the brief window between confirmation
// and execution. `executed` and `failed` are terminal success/failure;
// `cancelled` is the user-rejected terminal state.
export const orchestratorActionStatus = pgEnum('orchestrator_action_status', [
  'pending_confirmation',
  'confirmed',
  'cancelled',
  'executed',
  'failed',
])

// Orchestrator actions — audit log for every tool execution (REQ-ORCH-6,
// DESIGN-CHAT step 5, DESIGN-DATA §Orchestrator).
//
// `model_id` records which AI model requested the call (cost tracking,
// debugging — DESIGN-AI §Cost tracking). FK with SET NULL so deprecating a
// model leaves the audit trail intact.
//
// `message_id` is nullable: a `confirm`-class action is persisted in
// `pending_confirmation` before any assistant message is finalised; the
// message id is filled in once the tool result is appended.
//
// `affected_count` records the bulk-rule input (ADR-010, DESIGN-CONF) so
// we can audit why a normally-`auto` action was promoted to `confirm`.
//
// `meta` is a free-form jsonb bag for per-action metadata. Vault tools set
// `{"vault_access": true}` so audit views can highlight secret-touching
// actions (DESIGN-VAULT-DATA).
export const orchestratorActions = pgTable('orchestrator_actions', {
  id: text('id').primaryKey(), // ULID
  organisationId: text('organisation_id').notNull().references(() => organisations.id, { onDelete: 'cascade' }),
  conversationId: text('conversation_id').notNull().references(() => orchestratorConversations.id, { onDelete: 'cascade' }),
  messageId: text('message_id').references(() => orchestratorMessages.id, { onDelete: 'set null' }),
  userId: text('user_id').references(() => users.id, { onDelete: 'set null' }),
  modelId: text('model_id').references(() => aiModels.id, { onDelete: 'set null' }),
  toolName: text('tool_name').notNull(),
  parameters: jsonb('parameters').notNull(),
  result: jsonb('result'),
  class: orchestratorActionClass('class').notNull(),
  status: orchestratorActionStatus('status').notNull().default('pending_confirmation'),
  affectedCount: integer('affected_count'),
  error: text('error'),
  meta: jsonb('meta'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
  cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
  executedAt: timestamp('executed_at', { withTimezone: true }),
}, table => [
  index('orchestrator_actions_conversation_idx').on(table.conversationId, table.createdAt),
  index('orchestrator_actions_status_idx').on(table.status),
])

export type OrchestratorAction = typeof orchestratorActions.$inferSelect
export type NewOrchestratorAction = typeof orchestratorActions.$inferInsert
