import { integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core'
import { aiModels } from './ai-models'
import { organisations } from './organisations'

// Per-workspace orchestrator + AI configuration. See DESIGN-DATA §AI Provider,
// REQ-AI-3, REQ-ORCH-3.
//
// `organisation_id` is both PK and FK — exactly one row per workspace.
//
// `default_model_id` falls back to the global default (the `ai_models` row with
// `is_default = true`) when null. See DESIGN-AI §Provider-Model resolution.
//
// `history_limit` controls how many prior messages get pulled into the context
// window per turn. Defaults to 30 (REQ-ORCH-CONTEXT, NUXT_ORCHESTRATOR_HISTORY_LIMIT).
//
// `ai_display_name` is used as `author_name` when the orchestrator writes to the
// KB on the user's behalf (DESIGN-DATA §KB, ADR-007).
//
// `system_prompt` lets a workspace owner add custom instructions on top of the
// base orchestrator prompt; nullable.
export const orchestratorWorkspaceSettings = pgTable('orchestrator_workspace_settings', {
  organisationId: text('organisation_id').primaryKey().references(() => organisations.id, { onDelete: 'cascade' }),
  defaultModelId: text('default_model_id').references(() => aiModels.id, { onDelete: 'set null' }),
  aiDisplayName: text('ai_display_name').notNull().default('Claude-Orchestrator'),
  historyLimit: integer('history_limit').notNull().default(30),
  systemPrompt: text('system_prompt'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export type OrchestratorWorkspaceSettings = typeof orchestratorWorkspaceSettings.$inferSelect
export type NewOrchestratorWorkspaceSettings = typeof orchestratorWorkspaceSettings.$inferInsert
