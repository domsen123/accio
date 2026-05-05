/**
 * Messages service for the orchestrator (T-3.11).
 *
 * Tiny CRUD-style helper around `orchestrator_messages`. Sits next to the
 * conversations service so the chat handler can append messages and load
 * recent history without re-implementing Drizzle queries inline.
 *
 * `content` is jsonb of structured content blocks in the AI SDK shape
 * (`{ type: 'text', text }`, `{ type: 'tool-call', ... }`,
 * `{ type: 'tool-result', ... }`). The chat handler decides the exact shape;
 * the service simply persists what it gets.
 *
 * Refs: REQ-ORCH-1, DESIGN-CHAT step 1-4, DESIGN-DATA §Orchestrator.
 */
import type { OrchestratorMessage } from '../../database/schema'
import type { DatabaseClient } from '../../infrastructure/database/client'
import { asc, eq } from 'drizzle-orm'
import { ulid } from 'ulid'
import {
  orchestratorConversations,
  orchestratorMessages,
} from '../../database/schema'

export type OrchestratorMessageRole = 'user' | 'assistant' | 'tool_result'

export interface AppendMessageArgs {
  conversationId: string
  role: OrchestratorMessageRole
  /** Structured AI SDK content blocks. Persisted verbatim. */
  content: unknown
  /** Override the generated id (used when the chat handler needs it pre-emit). */
  id?: string
}

export interface LoadHistoryArgs {
  conversationId: string
  /** Default 30 (DESIGN-CHAT step 2). */
  limit?: number
}

export interface MessagesService {
  append: (args: AppendMessageArgs) => Promise<OrchestratorMessage>
  loadHistory: (args: LoadHistoryArgs) => Promise<OrchestratorMessage[]>
  /** Touch `orchestrator_conversations.updated_at` after a turn lands. */
  bumpConversationUpdatedAt: (conversationId: string) => Promise<void>
}

export interface CreateMessagesServiceDeps {
  db: DatabaseClient
}

export const DEFAULT_HISTORY_LIMIT = 30

export const createMessagesService = (
  deps: CreateMessagesServiceDeps,
): MessagesService => {
  const { db } = deps

  const append = async (args: AppendMessageArgs): Promise<OrchestratorMessage> => {
    const id = args.id ?? ulid()
    const inserted = await db.insert(orchestratorMessages).values({
      id,
      conversationId: args.conversationId,
      role: args.role,
      content: args.content as object,
    }).returning()
    return inserted[0]!
  }

  const loadHistory = async (args: LoadHistoryArgs): Promise<OrchestratorMessage[]> => {
    const limit = Math.max(1, args.limit ?? DEFAULT_HISTORY_LIMIT)
    // We want the *most recent* `limit` messages but in chronological order
    // for the model. Pull all (ordered asc) for a conversation; in practice
    // we trim — for tiny histories this is fine; for very large ones we'd
    // grab the last `limit` via a subquery. Conversation history is bounded
    // by usage, and the index is on (conversation_id, created_at).
    const rows = await db
      .select()
      .from(orchestratorMessages)
      .where(eq(orchestratorMessages.conversationId, args.conversationId))
      .orderBy(asc(orchestratorMessages.createdAt), asc(orchestratorMessages.id))
    if (rows.length <= limit)
      return rows
    return rows.slice(rows.length - limit)
  }

  const bumpConversationUpdatedAt = async (conversationId: string): Promise<void> => {
    await db
      .update(orchestratorConversations)
      .set({ updatedAt: new Date() })
      .where(eq(orchestratorConversations.id, conversationId))
  }

  return { append, loadHistory, bumpConversationUpdatedAt }
}
