/**
 * Zod v4 schemas + response serialisers for the orchestrator conversation
 * CRUD surface (T-3.9).
 *
 * The list query supports limit/offset, a soft-delete escape hatch, and four
 * sort orders. The detail query toggles whether the messages array ships with
 * the response (callers that only need conversation metadata can pass
 * `includeMessages=false`). The serialisers flatten Drizzle row types into
 * the JSON shape consumed by the UI — no Date instances cross the wire,
 * `content` jsonb passes through verbatim.
 *
 * Refs: REQ-ORCH-1 (list past conversations), REQ-ORCH-3 (mode toggle),
 * DESIGN-API §Orchestrator (route shapes), ADR-012 (server returns codes).
 */
import type { OrchestratorConversation, OrchestratorMessage } from '../../database/schema'
import { z } from 'zod'

const TITLE_MAX = 200

export const CONVERSATION_LIST_DEFAULT_LIMIT = 50
export const CONVERSATION_LIST_MAX_LIMIT = 200

export const conversationModeSchema = z.enum(['read_only', 'read_write'])
export type ConversationMode = z.infer<typeof conversationModeSchema>

// ─── Inputs ─────────────────────────────────────────────────────────────────

export const createConversationSchema = z.object({
  title: z.string().trim().max(TITLE_MAX).optional(),
  mode: conversationModeSchema.optional(),
  modelId: z.string().trim().min(1).optional(),
})
export type CreateConversationInput = z.infer<typeof createConversationSchema>

// At least one field required — empty PATCH is a 400 (`validation.failed`).
export const updateConversationSchema = z.object({
  title: z.string().trim().max(TITLE_MAX).optional(),
  mode: conversationModeSchema.optional(),
  modelId: z.string().trim().min(1).nullable().optional(),
}).refine(
  v => v.title !== undefined || v.mode !== undefined || v.modelId !== undefined,
  { message: 'at least one of title, mode, modelId is required' },
)
export type UpdateConversationInput = z.infer<typeof updateConversationSchema>

// ─── List + detail query params ────────────────────────────────────────────

const truthy = new Set(['1', 'true', 'yes', 'on'])
const falsy = new Set(['0', 'false', 'no', 'off'])

const booleanQuery = z.preprocess((v) => {
  if (typeof v === 'boolean')
    return v
  if (typeof v !== 'string')
    return v
  const lc = v.toLowerCase()
  if (truthy.has(lc))
    return true
  if (falsy.has(lc))
    return false
  return v
}, z.boolean().optional())

export const conversationListQuerySchema = z.object({
  includeDeleted: booleanQuery,
  limit: z.coerce.number().int().min(1).max(CONVERSATION_LIST_MAX_LIMIT).optional(),
  offset: z.coerce.number().int().min(0).optional(),
  sort: z.enum([
    'updatedAt:desc',
    'updatedAt:asc',
    'createdAt:desc',
    'createdAt:asc',
  ]).optional(),
})
export type ConversationListQuery = z.infer<typeof conversationListQuerySchema>

export const conversationGetQuerySchema = z.object({
  includeMessages: booleanQuery,
})
export type ConversationGetQuery = z.infer<typeof conversationGetQuerySchema>

// ─── Output shapes ──────────────────────────────────────────────────────────

export interface SerialisedConversation {
  id: string
  organisationId: string
  userId: string | null
  title: string
  mode: ConversationMode
  modelId: string | null
  systemPrompt: string | null
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}

export interface SerialisedConversationListItem extends SerialisedConversation {
  /**
   * Timestamp of the most recent message (`max(created_at)` from
   * `orchestrator_messages`). Cheaper than a `count(*)` on every list call —
   * supports the "resume the most recent conversation" UX (REQ-ORCH-1) without
   * a separate round-trip. Null when the conversation has no messages yet.
   */
  lastMessageAt: string | null
}

export interface SerialisedMessage {
  id: string
  conversationId: string
  role: 'user' | 'assistant' | 'tool_result'
  content: unknown
  createdAt: string
}

export const serialiseConversation = (row: OrchestratorConversation): SerialisedConversation => ({
  id: row.id,
  organisationId: row.organisationId,
  userId: row.userId,
  title: row.title,
  mode: row.mode as ConversationMode,
  modelId: row.modelId,
  systemPrompt: row.systemPrompt,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
  deletedAt: row.deletedAt ? row.deletedAt.toISOString() : null,
})

export const serialiseConversationListItem = (
  row: OrchestratorConversation & { lastMessageAt: Date | null },
): SerialisedConversationListItem => ({
  ...serialiseConversation(row),
  lastMessageAt: row.lastMessageAt ? row.lastMessageAt.toISOString() : null,
})

export const serialiseMessage = (row: OrchestratorMessage): SerialisedMessage => ({
  id: row.id,
  conversationId: row.conversationId,
  role: row.role as 'user' | 'assistant' | 'tool_result',
  content: row.content,
  createdAt: row.createdAt.toISOString(),
})
