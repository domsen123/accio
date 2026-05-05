// Audit log writer + invocation wrapper for the in-process MCP registry (T-3.7).
//
// Refs: REQ-ORCH-6 (every executed write tool gets a row in
// `orchestrator_actions`), REQ-AI-5 (model_id recorded per action),
// DESIGN-CHAT step 5 ("every executed tool is appended to orchestrator_actions"),
// ADR-010 (bulk-promotion captured via `affected_count`).
//
// Architecture: this module sits *next to* `mcp-server.ts`, never inside it.
// `mcp-server.ts` stays pure-structural — schema validation, classification,
// confirmation gate. Persistence is added by wrapping `server.invoke` with
// `auditedInvoke` here, so the registry remains DB-free and unit-testable.
//
// The chat handler (T-3.11) and confirm/cancel endpoints (T-3.12) call
// `auditService.{recordPending,recordCancelled,markConfirmed,attachMessageId}`
// directly; `auditedInvoke` handles the auto/post-confirm execution path
// internally (insert + transition pending→executed/failed in one place).

import type { OrchestratorAction } from '../../database/schema'
import type { DatabaseClient } from '../../infrastructure/database/client'
import type {
  McpServer,
  McpToolContext,
  McpToolResult,
} from './mcp-server'

import { and, asc, desc, eq, gte, inArray, like, lte, sql } from 'drizzle-orm'
import { ulid } from 'ulid'
import { aiModels, orchestratorActions, orchestratorConversations } from '../../database/schema'
import { ConfirmationRequiredError, McpToolError } from './errors'

/** Class recorded on the audit row — mirrors `Tool.class` minus the dynamic form. */
export type AuditActionClass = 'auto' | 'confirm'

/** Lifecycle state on the audit row — mirrors the pgEnum order. */
export type AuditActionStatus
  = | 'pending_confirmation'
    | 'confirmed'
    | 'cancelled'
    | 'executed'
    | 'failed'

/**
 * Common identifying fields every audit-log call needs. The chat handler
 * (T-3.11) supplies these from the conversation + selected model; T-3.12's
 * confirm/cancel endpoints carry them through from the SSE state.
 */
export interface AuditScope {
  organisationId: string
  conversationId: string
  userId: string | null
  /** AI model that requested the call — REQ-AI-5. Null only for system-driven calls. */
  modelId: string | null
}

export interface RecordPendingArgs extends AuditScope {
  toolName: string
  parameters: unknown
  class: AuditActionClass
  affectedCount: number
  /** Filled in after the tool result is appended (T-3.11). */
  messageId?: string | null
}

export interface RecordExecutedArgs extends AuditScope {
  toolName: string
  parameters: unknown
  class: AuditActionClass
  affectedCount: number
  result: unknown
  messageId?: string | null
}

export interface RecordFailedArgs extends AuditScope {
  toolName: string
  parameters: unknown
  class: AuditActionClass
  affectedCount: number
  error: string
  messageId?: string | null
}

/**
 * Filter inputs accepted by {@link AuditService.list}. All fields optional;
 * empty arrays are treated as "no filter on this column" by the implementation.
 */
export interface AuditListFilter {
  conversationId?: string
  status?: AuditActionStatus[]
  class?: AuditActionClass[]
  toolName?: string
  modelId?: string
  /** Inclusive lower bound on `created_at`. */
  since?: Date
  /** Inclusive upper bound on `created_at`. */
  until?: Date
}

export interface AuditListPagination {
  /** Default 50, max 200. */
  limit?: number
  /** Default 0. */
  offset?: number
}

export type AuditListSort = 'createdAt:desc' | 'createdAt:asc'

export interface AuditListArgs {
  organisationId: string
  filter?: AuditListFilter
  pagination?: AuditListPagination
  sort?: AuditListSort
}

/** Hydrated row returned by {@link AuditService.list} / {@link AuditService.findById}. */
export interface AuditRowHydrated {
  id: string
  createdAt: Date
  toolName: string
  class: AuditActionClass
  status: AuditActionStatus
  affectedCount: number | null
  parameters: unknown
  result: unknown
  error: string | null
  model: { id: string, displayName: string, modelId: string } | null
  userId: string | null
  conversationId: string
  conversationTitle: string | null
  messageId: string | null
  organisationId: string
  executedAt: Date | null
  confirmedAt: Date | null
  cancelledAt: Date | null
}

export interface AuditListResult {
  rows: AuditRowHydrated[]
  total: number
}

export const AUDIT_LIST_DEFAULT_LIMIT = 50
export const AUDIT_LIST_MAX_LIMIT = 200

export interface AuditService {
  /** Insert a `pending_confirmation` row (gate fired). Returns the new action id. */
  recordPending: (args: RecordPendingArgs) => Promise<{ actionId: string }>
  /** Insert an `executed` row (auto or post-confirm success). Returns the new action id. */
  recordExecuted: (args: RecordExecutedArgs) => Promise<{ actionId: string }>
  /** Insert a `failed` row (handler threw). Returns the new action id. */
  recordFailed: (args: RecordFailedArgs) => Promise<{ actionId: string }>
  /** Flip a pending row to `cancelled` (user clicked cancel — T-3.12). */
  recordCancelled: (actionId: string) => Promise<void>
  /** Flip a pending row to `confirmed` immediately before re-invoke (T-3.12). */
  markConfirmed: (actionId: string) => Promise<void>
  /** Late-bind the message id once the assistant message is finalised (T-3.11). */
  attachMessageId: (actionId: string, messageId: string) => Promise<void>
  /**
   * Patch a previously-pending (now `confirmed`) row to `executed` with the
   * handler's result. Used by `auditedInvoke` on the post-confirm re-entry
   * path so we keep one audit row per logical call.
   */
  patchExecuted: (actionId: string, result: unknown) => Promise<void>
  /**
   * Patch a previously-pending (now `confirmed`) row to `failed` with the
   * handler error. Used by `auditedInvoke` on the post-confirm re-entry path.
   */
  patchFailed: (actionId: string, errorMessage: string) => Promise<void>
  /**
   * Workspace-scoped, paginated, filterable read of `orchestrator_actions`
   * rows for the audit log UI (T-3.8). Joins `ai_models` for the model
   * attribution column and `orchestrator_conversations` for the conversation
   * title. Returns `{ rows, total }`; `total` is a `count(*)` over the same
   * WHERE clause so callers can render page counts.
   */
  list: (args: AuditListArgs) => Promise<AuditListResult>
  /**
   * Single-row detail lookup for the audit drawer (T-3.8). Returns null if
   * the row does not exist OR belongs to a different organisation — the API
   * route translates either case to 404 to avoid existence leaks.
   */
  findById: (actionId: string, organisationId: string) => Promise<AuditRowHydrated | null>
}

export interface CreateAuditServiceDeps {
  db: DatabaseClient
}

/**
 * Build an `auditService`. The chat handler resolves it from the container
 * (`server/utils/container.ts` exposes a singleton). Tests construct directly.
 */
export const createAuditService = ({ db }: CreateAuditServiceDeps): AuditService => {
  const recordPending = async (args: RecordPendingArgs): Promise<{ actionId: string }> => {
    const actionId = ulid()
    await db.insert(orchestratorActions).values({
      id: actionId,
      organisationId: args.organisationId,
      conversationId: args.conversationId,
      userId: args.userId,
      modelId: args.modelId,
      messageId: args.messageId ?? null,
      toolName: args.toolName,
      parameters: args.parameters as object,
      class: args.class,
      status: 'pending_confirmation',
      affectedCount: args.affectedCount,
    })
    return { actionId }
  }

  const recordExecuted = async (args: RecordExecutedArgs): Promise<{ actionId: string }> => {
    const actionId = ulid()
    await db.insert(orchestratorActions).values({
      id: actionId,
      organisationId: args.organisationId,
      conversationId: args.conversationId,
      userId: args.userId,
      modelId: args.modelId,
      messageId: args.messageId ?? null,
      toolName: args.toolName,
      parameters: args.parameters as object,
      result: (args.result ?? null) as object | null,
      class: args.class,
      status: 'executed',
      affectedCount: args.affectedCount,
      executedAt: new Date(),
    })
    return { actionId }
  }

  const recordFailed = async (args: RecordFailedArgs): Promise<{ actionId: string }> => {
    const actionId = ulid()
    await db.insert(orchestratorActions).values({
      id: actionId,
      organisationId: args.organisationId,
      conversationId: args.conversationId,
      userId: args.userId,
      modelId: args.modelId,
      messageId: args.messageId ?? null,
      toolName: args.toolName,
      parameters: args.parameters as object,
      class: args.class,
      status: 'failed',
      affectedCount: args.affectedCount,
      error: args.error,
    })
    return { actionId }
  }

  const recordCancelled = async (actionId: string): Promise<void> => {
    await db
      .update(orchestratorActions)
      .set({ status: 'cancelled', cancelledAt: new Date() })
      .where(eq(orchestratorActions.id, actionId))
  }

  const markConfirmed = async (actionId: string): Promise<void> => {
    await db
      .update(orchestratorActions)
      .set({ status: 'confirmed', confirmedAt: new Date() })
      .where(eq(orchestratorActions.id, actionId))
  }

  const attachMessageId = async (actionId: string, messageId: string): Promise<void> => {
    await db
      .update(orchestratorActions)
      .set({ messageId })
      .where(eq(orchestratorActions.id, actionId))
  }

  const patchExecuted = async (actionId: string, result: unknown): Promise<void> => {
    await db
      .update(orchestratorActions)
      .set({
        status: 'executed',
        executedAt: new Date(),
        result: (result ?? null) as object | null,
      })
      .where(eq(orchestratorActions.id, actionId))
  }

  const patchFailed = async (actionId: string, errorMessage: string): Promise<void> => {
    await db
      .update(orchestratorActions)
      .set({ status: 'failed', error: errorMessage })
      .where(eq(orchestratorActions.id, actionId))
  }

  // ─── Read side (T-3.8) ───────────────────────────────────────────────────
  //
  // Both `list` and `findById` LEFT JOIN on `ai_models` (model attribution
  // column — REQ-AI-5) and `orchestrator_conversations` (conversation title
  // for the drawer). Workspace scoping is enforced via the mandatory
  // `organisationId` filter on every call site.

  const buildWhere = (organisationId: string, filter?: AuditListFilter) => {
    const clauses = [eq(orchestratorActions.organisationId, organisationId)]
    if (filter?.conversationId) {
      clauses.push(eq(orchestratorActions.conversationId, filter.conversationId))
    }
    if (filter?.status && filter.status.length > 0) {
      clauses.push(inArray(orchestratorActions.status, filter.status))
    }
    if (filter?.class && filter.class.length > 0) {
      clauses.push(inArray(orchestratorActions.class, filter.class))
    }
    if (filter?.toolName) {
      // Substring match — the UI presents this as a free-text filter; tool
      // names are short snake_case identifiers so a `LIKE %x%` is fine.
      clauses.push(like(orchestratorActions.toolName, `%${filter.toolName}%`))
    }
    if (filter?.modelId) {
      clauses.push(eq(orchestratorActions.modelId, filter.modelId))
    }
    if (filter?.since) {
      clauses.push(gte(orchestratorActions.createdAt, filter.since))
    }
    if (filter?.until) {
      clauses.push(lte(orchestratorActions.createdAt, filter.until))
    }
    return and(...clauses)
  }

  const hydrateRow = (row: {
    action: typeof orchestratorActions.$inferSelect
    model: { id: string, displayName: string, modelId: string } | null
    conversationTitle: string | null
  }): AuditRowHydrated => ({
    id: row.action.id,
    createdAt: row.action.createdAt,
    toolName: row.action.toolName,
    class: row.action.class as AuditActionClass,
    status: row.action.status as AuditActionStatus,
    affectedCount: row.action.affectedCount,
    parameters: row.action.parameters,
    result: row.action.result,
    error: row.action.error,
    model: row.model,
    userId: row.action.userId,
    conversationId: row.action.conversationId,
    conversationTitle: row.conversationTitle,
    messageId: row.action.messageId,
    organisationId: row.action.organisationId,
    executedAt: row.action.executedAt,
    confirmedAt: row.action.confirmedAt,
    cancelledAt: row.action.cancelledAt,
  })

  const list = async (args: AuditListArgs): Promise<AuditListResult> => {
    const limit = Math.min(
      Math.max(1, args.pagination?.limit ?? AUDIT_LIST_DEFAULT_LIMIT),
      AUDIT_LIST_MAX_LIMIT,
    )
    const offset = Math.max(0, args.pagination?.offset ?? 0)
    const sort = args.sort ?? 'createdAt:desc'
    const orderBy = sort === 'createdAt:asc'
      ? asc(orchestratorActions.createdAt)
      : desc(orchestratorActions.createdAt)

    const where = buildWhere(args.organisationId, args.filter)

    const rawRows = await db
      .select({
        action: orchestratorActions,
        modelId: aiModels.id,
        modelDisplayName: aiModels.displayName,
        modelModelId: aiModels.modelId,
        conversationTitle: orchestratorConversations.title,
      })
      .from(orchestratorActions)
      .leftJoin(aiModels, eq(aiModels.id, orchestratorActions.modelId))
      .leftJoin(
        orchestratorConversations,
        eq(orchestratorConversations.id, orchestratorActions.conversationId),
      )
      .where(where)
      .orderBy(orderBy, desc(orchestratorActions.id))
      .limit(limit)
      .offset(offset)

    const totalRows = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(orchestratorActions)
      .where(where)
    const total = totalRows[0]?.count ?? 0

    const rows: AuditRowHydrated[] = rawRows.map(r => hydrateRow({
      action: r.action,
      model: r.modelId
        ? { id: r.modelId, displayName: r.modelDisplayName ?? '', modelId: r.modelModelId ?? '' }
        : null,
      conversationTitle: r.conversationTitle,
    }))

    return { rows, total }
  }

  const findById = async (
    actionId: string,
    organisationId: string,
  ): Promise<AuditRowHydrated | null> => {
    const rawRows = await db
      .select({
        action: orchestratorActions,
        modelId: aiModels.id,
        modelDisplayName: aiModels.displayName,
        modelModelId: aiModels.modelId,
        conversationTitle: orchestratorConversations.title,
      })
      .from(orchestratorActions)
      .leftJoin(aiModels, eq(aiModels.id, orchestratorActions.modelId))
      .leftJoin(
        orchestratorConversations,
        eq(orchestratorConversations.id, orchestratorActions.conversationId),
      )
      .where(and(
        eq(orchestratorActions.id, actionId),
        eq(orchestratorActions.organisationId, organisationId),
      ))
      .limit(1)

    const row = rawRows[0]
    if (!row)
      return null
    return hydrateRow({
      action: row.action,
      model: row.modelId
        ? { id: row.modelId, displayName: row.modelDisplayName ?? '', modelId: row.modelModelId ?? '' }
        : null,
      conversationTitle: row.conversationTitle,
    })
  }

  return {
    recordPending,
    recordExecuted,
    recordFailed,
    recordCancelled,
    markConfirmed,
    attachMessageId,
    patchExecuted,
    patchFailed,
    list,
    findById,
  }
}

/**
 * Successful execution envelope returned by {@link auditedInvoke}.
 */
export interface AuditedInvokeExecuted<O> {
  kind: 'executed'
  /** Audit-row id corresponding to the `executed` row. Empty string for read tools (no audit). */
  actionId: string
  result: McpToolResult<O>
}

/**
 * Confirmation-gate envelope returned by {@link auditedInvoke} for write tools
 * whose effective class is `confirm` and where no token was supplied. The chat
 * handler (T-3.11) emits the SSE `confirmation_required` event from this and
 * the confirm endpoint (T-3.12) re-enters with `confirmationToken` + `priorActionId`.
 */
export interface AuditedInvokeConfirmationRequired {
  kind: 'confirmation_required'
  /** Audit-row id of the freshly-inserted `pending_confirmation` row. */
  actionId: string
  toolName: string
  /** Validated, post-Zod input. Safe to serialise into the SSE event. */
  input: unknown
  affectedCount: number
  reason: 'class' | 'bulk'
}

export type AuditedInvokeOutcome<O>
  = | AuditedInvokeExecuted<O>
    | AuditedInvokeConfirmationRequired

export interface AuditedInvokeArgs {
  server: McpServer
  audit: AuditService
  name: string
  input: unknown
  ctx: McpToolContext
  /** AI model that requested the call (REQ-AI-5). Null/undefined for system-driven calls. */
  modelId: string | null
  /**
   * On post-confirm re-entry (T-3.12), the audit-row id of the previously
   * persisted `pending_confirmation`. `auditedInvoke` flips it to `confirmed`
   * before invoking the handler, then patches it to `executed` (or `failed`)
   * on the way out — keeping one row per logical call.
   *
   * Absent on a fresh invocation (registry will gate or insert a new row).
   */
  priorActionId?: string
}

/**
 * Run a tool through the registry while persisting an `orchestrator_actions`
 * row at every state transition. **Read tools are a no-op** — REQ-ORCH-6 only
 * mandates audit for *write* tools. The classifier short-circuits before any
 * DB write, so read tools have zero audit footprint.
 *
 * Outcome shapes:
 *   - `kind: 'executed'`              — handler ran, row is `executed`.
 *   - `kind: 'confirmation_required'` — gate fired, row is `pending_confirmation`.
 *
 * Failures: when the handler throws a non-`ConfirmationRequiredError`, the
 * function records the row as `failed` (or patches the prior row) and
 * **re-throws** so the chat handler can pattern-match the same way it does on
 * raw `invoke` (e.g. distinguish `McpToolNotFoundEntityError`).
 *
 * Bulk-rule recording: when the call was auto-promoted (`reason='bulk'`), the
 * audit row records `class: 'auto'` (the *declared* class) so the log
 * preserves "this would normally have been auto, but the bulk rule fired"
 * (ADR-010). Intrinsic-confirm tools record `class: 'confirm'`.
 */
export const auditedInvoke = async <O = unknown>(
  args: AuditedInvokeArgs,
): Promise<AuditedInvokeOutcome<O>> => {
  const { server, audit, name, input, ctx, modelId, priorActionId } = args

  // Pre-flight classify so we know (a) whether to audit at all (read tools
  // skip), (b) the effective class for the row, and (c) the affected_count.
  // Errors here (unknown tool, bad input) bubble to the caller — they never
  // produce an audit row because we don't know the tool yet.
  const classification = server.classify(name, input)
  const tool = server.get(name)
  if (!tool) {
    // `classify` already threw if the tool is missing; this narrows the type.
    throw new Error(`audited_invoke: tool "${name}" disappeared between classify and get`)
  }

  // Read-only tools: pass through, no audit. REQ-ORCH-6 covers writes only.
  if (tool.mode === 'read') {
    const result = await server.invoke<O>(name, input, ctx)
    return { kind: 'executed', actionId: '', result }
  }

  // Recorded class for the row — bulk-promoted calls keep their declared
  // `auto` class (so the log shows the bulk rule fired); intrinsic-confirm
  // tools record `confirm`.
  const recordedClass: AuditActionClass
    = classification.reason === 'bulk' ? 'auto' : classification.effectiveClass

  // Confirmation gate: write tool, effective class is `confirm`, no token.
  // Persist a pending row and return without invoking the handler.
  if (classification.effectiveClass === 'confirm' && !ctx.confirmationToken) {
    const { actionId } = await audit.recordPending({
      organisationId: ctx.organisationId,
      conversationId: ctx.conversationId ?? '',
      userId: ctx.userId,
      modelId,
      toolName: name,
      parameters: input,
      class: recordedClass,
      affectedCount: classification.affectedCount,
    })
    return {
      kind: 'confirmation_required',
      actionId,
      toolName: name,
      input,
      affectedCount: classification.affectedCount,
      reason: classification.reason,
    }
  }

  // Re-entry after user confirmation (T-3.12): mark the prior row `confirmed`
  // before invoking. We then patch the same row to `executed`/`failed` —
  // keeping one audit row per logical call.
  if (priorActionId) {
    await audit.markConfirmed(priorActionId)
  }

  try {
    const result = await server.invoke<O>(name, input, ctx)

    if (priorActionId) {
      await audit.patchExecuted(priorActionId, result.result)
      return { kind: 'executed', actionId: priorActionId, result }
    }

    const { actionId } = await audit.recordExecuted({
      organisationId: ctx.organisationId,
      conversationId: ctx.conversationId ?? '',
      userId: ctx.userId,
      modelId,
      toolName: name,
      parameters: input,
      class: recordedClass,
      affectedCount: classification.affectedCount,
      result: result.result,
    })
    return { kind: 'executed', actionId, result }
  }
  catch (err) {
    // ConfirmationRequiredError shouldn't surface here (we already gated on
    // it above); if a tool re-throws one from inside its handler we treat it
    // as an unexpected failure rather than re-gating — defensive.
    const errorMessage = err instanceof Error ? err.message : String(err)

    if (priorActionId) {
      await audit.patchFailed(priorActionId, errorMessage)
    }
    else {
      await audit.recordFailed({
        organisationId: ctx.organisationId,
        conversationId: ctx.conversationId ?? '',
        userId: ctx.userId,
        modelId,
        toolName: name,
        parameters: input,
        class: recordedClass,
        affectedCount: classification.affectedCount,
        error: errorMessage,
      })
    }

    // Bubble McpToolError subclasses unchanged so the chat handler can
    // pattern-match (e.g. `McpToolNotFoundEntityError`). Anything else
    // (already wrapped in `McpToolExecutionError` by `invoke`) re-throws too.
    if (err instanceof McpToolError) {
      throw err
    }
    if (err instanceof ConfirmationRequiredError) {
      throw err
    }
    throw err
  }
}

/** Re-export the row type for convenience (T-3.8 read-side will reuse it). */
export type AuditRow = OrchestratorAction
