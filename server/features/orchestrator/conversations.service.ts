/**
 * Workspace-scoped CRUD service for `orchestrator_conversations` (T-3.9).
 *
 * Responsibilities:
 *   - `create` / `update` validate any provided `modelId` against
 *     `ai_models` (must exist, be enabled, and advertise both
 *     `supports_tools` + `supports_streaming` per DESIGN-AI §Capability
 *     validation). The orchestrator cannot run without those flags.
 *   - `list` is workspace-scoped, soft-delete-aware, and emits
 *     `lastMessageAt` per row via a LEFT JOIN-style subquery so the UI can
 *     order/group "resume the most recent" without a second round-trip
 *     (REQ-ORCH-1). `total` is a separate `count(*)` over the same WHERE
 *     clause for accurate pagination.
 *   - `get` returns the conversation plus (optionally) the full immutable
 *     message history ordered ascending — drives the resume-conversation
 *     view (REQ-ORCH-1). Cross-org or soft-deleted lookups surface as
 *     `OrchestratorConversationNotFoundError` (no existence leak).
 *   - `softDelete` flips `deleted_at` and is idempotent — the message
 *     stream endpoint (T-3.11) and the audit log (T-3.7) both retain FK
 *     references via `ON DELETE` rules baked into the schema, so a hard
 *     delete is intentionally not exposed.
 *
 * Refs: REQ-ORCH-1, REQ-ORCH-3, DESIGN-API §Orchestrator, ADR-012.
 */
import type { OrchestratorConversation, OrchestratorMessage } from '../../database/schema'
import type { DatabaseClient } from '../../infrastructure/database/client'
import { and, asc, desc, eq, inArray, isNull, sql } from 'drizzle-orm'
import { ulid } from 'ulid'
import { aiModels, orchestratorConversations, orchestratorMessages } from '../../database/schema'
import { OrchestratorConversationNotFoundError, OrchestratorModelInvalidError } from './errors'

export type ConversationMode = 'read_only' | 'read_write'

export type ConversationListSort
  = | 'updatedAt:desc'
    | 'updatedAt:asc'
    | 'createdAt:desc'
    | 'createdAt:asc'

export const CONVERSATION_LIST_DEFAULT_LIMIT = 50
export const CONVERSATION_LIST_MAX_LIMIT = 200

export interface ConversationListItem extends OrchestratorConversation {
  /** Most-recent message `created_at`, or null when the conversation is empty. */
  lastMessageAt: Date | null
}

export interface ConversationListResult {
  rows: ConversationListItem[]
  total: number
}

export interface CreateConversationArgs {
  organisationId: string
  userId: string | null
  title?: string
  mode?: ConversationMode
  modelId?: string | null
}

export interface UpdateConversationArgs {
  id: string
  organisationId: string
  title?: string
  mode?: ConversationMode
  modelId?: string | null
}

export interface ListConversationsArgs {
  organisationId: string
  includeDeleted?: boolean
  limit?: number
  offset?: number
  sort?: ConversationListSort
}

export interface GetConversationArgs {
  id: string
  organisationId: string
  includeMessages?: boolean
  /**
   * When true, soft-deleted conversations resolve normally instead of 404-ing.
   * Defaults to false (the API layer keeps it false to enforce REQ-ORCH-1's
   * "list past conversations" semantics).
   */
  includeDeleted?: boolean
}

export interface GetConversationResult {
  conversation: OrchestratorConversation
  messages?: OrchestratorMessage[]
}

export interface SoftDeleteConversationArgs {
  id: string
  organisationId: string
}

export interface ConversationsService {
  create: (args: CreateConversationArgs) => Promise<OrchestratorConversation>
  list: (args: ListConversationsArgs) => Promise<ConversationListResult>
  get: (args: GetConversationArgs) => Promise<GetConversationResult>
  update: (args: UpdateConversationArgs) => Promise<OrchestratorConversation>
  softDelete: (args: SoftDeleteConversationArgs) => Promise<void>
}

export interface CreateConversationsServiceDeps {
  db: DatabaseClient
}

/**
 * Capability gate (DESIGN-AI). Performs one read against `ai_models` and
 * throws an `OrchestratorModelInvalidError` describing exactly which check
 * failed so the API can surface the precise reason in its error code.
 */
const validateModelOrThrow = async (db: DatabaseClient, modelId: string): Promise<void> => {
  const rows = await db
    .select({
      enabled: aiModels.enabled,
      supportsTools: aiModels.supportsTools,
      supportsStreaming: aiModels.supportsStreaming,
    })
    .from(aiModels)
    .where(eq(aiModels.id, modelId))
    .limit(1)

  const row = rows[0]
  if (!row)
    throw new OrchestratorModelInvalidError(modelId, 'not_found')
  if (!row.enabled)
    throw new OrchestratorModelInvalidError(modelId, 'disabled')
  if (!row.supportsTools)
    throw new OrchestratorModelInvalidError(modelId, 'lacks_tools')
  if (!row.supportsStreaming)
    throw new OrchestratorModelInvalidError(modelId, 'lacks_streaming')
}

export const createConversationsService = ({ db }: CreateConversationsServiceDeps): ConversationsService => {
  const create = async (args: CreateConversationArgs): Promise<OrchestratorConversation> => {
    if (args.modelId)
      await validateModelOrThrow(db, args.modelId)

    const id = ulid()
    const inserted = await db.insert(orchestratorConversations).values({
      id,
      organisationId: args.organisationId,
      userId: args.userId,
      title: args.title ?? '',
      mode: args.mode ?? 'read_only',
      modelId: args.modelId ?? null,
    }).returning()

    return inserted[0]!
  }

  const list = async (args: ListConversationsArgs): Promise<ConversationListResult> => {
    const limit = Math.min(
      Math.max(1, args.limit ?? CONVERSATION_LIST_DEFAULT_LIMIT),
      CONVERSATION_LIST_MAX_LIMIT,
    )
    const offset = Math.max(0, args.offset ?? 0)
    const sort = args.sort ?? 'updatedAt:desc'

    const clauses = [eq(orchestratorConversations.organisationId, args.organisationId)]
    if (!args.includeDeleted)
      clauses.push(isNull(orchestratorConversations.deletedAt))
    const where = and(...clauses)

    const sortColumn = sort.startsWith('updatedAt')
      ? orchestratorConversations.updatedAt
      : orchestratorConversations.createdAt
    const orderBy = sort.endsWith(':asc') ? asc(sortColumn) : desc(sortColumn)

    const conversationRows = await db
      .select()
      .from(orchestratorConversations)
      .where(where)
      .orderBy(orderBy, desc(orchestratorConversations.id))
      .limit(limit)
      .offset(offset)

    const totalRows = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(orchestratorConversations)
      .where(where)
    const total = totalRows[0]?.count ?? 0

    // Hydrate `lastMessageAt` via a single grouped query over the page's
    // conversation ids — keeps the read indexed (via
    // `orchestrator_messages_conversation_idx`) and avoids one-round-trip-per-row.
    const ids = conversationRows.map(r => r.id)
    const lastMessageMap = new Map<string, Date>()
    if (ids.length > 0) {
      const messageAggRows = await db
        .select({
          conversationId: orchestratorMessages.conversationId,
          lastMessageAt: sql<Date>`max(${orchestratorMessages.createdAt})`,
        })
        .from(orchestratorMessages)
        .where(inArray(orchestratorMessages.conversationId, ids))
        .groupBy(orchestratorMessages.conversationId)
      for (const row of messageAggRows) {
        if (row.lastMessageAt)
          lastMessageMap.set(row.conversationId, new Date(row.lastMessageAt))
      }
    }

    const rows: ConversationListItem[] = conversationRows.map(r => ({
      ...r,
      lastMessageAt: lastMessageMap.get(r.id) ?? null,
    }))

    return { rows, total }
  }

  const get = async (args: GetConversationArgs): Promise<GetConversationResult> => {
    const conversationRows = await db
      .select()
      .from(orchestratorConversations)
      .where(and(
        eq(orchestratorConversations.id, args.id),
        eq(orchestratorConversations.organisationId, args.organisationId),
      ))
      .limit(1)

    const conversation = conversationRows[0]
    if (!conversation)
      throw new OrchestratorConversationNotFoundError(args.id)
    if (conversation.deletedAt && !args.includeDeleted)
      throw new OrchestratorConversationNotFoundError(args.id)

    if (args.includeMessages === false)
      return { conversation }

    const messages = await db
      .select()
      .from(orchestratorMessages)
      .where(eq(orchestratorMessages.conversationId, conversation.id))
      .orderBy(asc(orchestratorMessages.createdAt), asc(orchestratorMessages.id))

    return { conversation, messages }
  }

  const update = async (args: UpdateConversationArgs): Promise<OrchestratorConversation> => {
    // Verify ownership first so we don't validate a model for a row we can't
    // touch (and so a cross-org caller gets a uniform 404 regardless of model
    // arg validity).
    const existing = await db
      .select()
      .from(orchestratorConversations)
      .where(and(
        eq(orchestratorConversations.id, args.id),
        eq(orchestratorConversations.organisationId, args.organisationId),
      ))
      .limit(1)

    if (!existing[0] || existing[0].deletedAt)
      throw new OrchestratorConversationNotFoundError(args.id)

    if (args.modelId)
      await validateModelOrThrow(db, args.modelId)

    const patch: Partial<typeof orchestratorConversations.$inferInsert> = {
      updatedAt: new Date(),
    }
    if (args.title !== undefined)
      patch.title = args.title
    if (args.mode !== undefined)
      patch.mode = args.mode
    if (args.modelId !== undefined)
      patch.modelId = args.modelId

    const updated = await db
      .update(orchestratorConversations)
      .set(patch)
      .where(eq(orchestratorConversations.id, args.id))
      .returning()

    return updated[0]!
  }

  const softDelete = async (args: SoftDeleteConversationArgs): Promise<void> => {
    // Idempotent: if the row is missing OR already soft-deleted, no-op
    // succeeds. Cross-org rows are also a no-op (the WHERE clause includes
    // organisationId), and the API guard already gated on workspace
    // membership.
    await db
      .update(orchestratorConversations)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(and(
        eq(orchestratorConversations.id, args.id),
        eq(orchestratorConversations.organisationId, args.organisationId),
        isNull(orchestratorConversations.deletedAt),
      ))
  }

  return { create, list, get, update, softDelete }
}
