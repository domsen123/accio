/**
 * Streaming chat handler — the centrepiece of Phase 3 (T-3.11).
 *
 * Refs: REQ-ORCH-1 (token-by-token streaming + persisted history),
 * REQ-ORCH-3 (mode-gated tool registry), REQ-ORCH-4 (confirmation flow),
 * REQ-ORCH-7 (author propagation), REQ-ORCH-CONTEXT (history limit),
 * DESIGN-CHAT §1-5 (canonical loop), ADR-006 (in-process MCP),
 * ADR-010 (bulk rule).
 *
 * Architecture decision — MANUAL chat loop:
 *   The AI SDK's `streamText` exposes tools to the model with
 *   `description` + `inputSchema` only (no `execute`). We iterate
 *   `result.fullStream` ourselves: collect text deltas, collect tool calls,
 *   on `finish` execute every tool call via `auditedInvoke`. If any tool
 *   gates on a confirmation, emit `confirmation_required` to the SSE stream
 *   and end the response — the user clicks Confirm and T-3.12's `/confirm`
 *   route re-enters this handler via `resumeFromConfirmation`. Otherwise we
 *   loop and re-invoke `streamText` with the new tool-result message in
 *   history.
 *
 * Why we don't use the container's `orchestratorAiClient` singleton:
 *   The singleton is built with a per-process empty MCP registry (see
 *   `server/utils/container.ts`). The set of tools depends on the
 *   conversation's mode (REQ-ORCH-3), so we instantiate a fresh registry
 *   per request — read tools always, write tools only for `read_write` —
 *   and pass it to a request-scoped ai-client.
 */

import type { ToolCallPart, ToolModelMessage, ToolResultPart } from '@ai-sdk/provider-utils'
import type { ModelMessage, TextStreamPart, ToolSet } from 'ai'
import type { EventStream, H3Event } from 'h3'
import type { OrchestratorMessage } from '../../database/schema'
import type { DatabaseClient } from '../../infrastructure/database/client'
import type { AiProviderService } from '../ai/provider'
import type { KbCategoryService, KbEntryService, KbTagService } from '../kb/service'
import type { Permission, PermissionScope } from '../rbac/permissions'
import type { TodoService } from '../todo/service'
import type { AuditedInvokeOutcome, AuditService } from './audit'
import type { ConversationsService } from './conversations.service'
import type { McpToolContext } from './mcp-server'
import type { MessagesService } from './messages.service'
import { createError } from 'h3'

import { ulid } from 'ulid'
import { z } from 'zod'

import { createOrchestratorAiClient } from './ai-client'
import { auditedInvoke } from './audit'
import {
  ConfirmationRequiredError,
  McpToolError,
  OrchestratorConversationNotFoundError,
} from './errors'
import { createMcpServer } from './mcp-server'
import { registerReadTools, registerWriteToolsKb, registerWriteToolsTodo } from './tools'

// ─── Public surface ─────────────────────────────────────────────────────────

/**
 * SSE event vocabulary (keep in sync with the route file's docblock).
 */
export type ChatStreamEvent
  = | { type: 'text-delta', messageId: string, delta: string }
    | { type: 'tool-call', toolCallId: string, toolName: string, input: unknown }
    | { type: 'tool-result', toolCallId: string, actionId: string, result: unknown }
    | {
      type: 'confirmation_required'
      toolCallId: string
      actionId: string
      toolName: string
      input: unknown
      affectedCount: number
      reason: 'class' | 'bulk'
    }
    | { type: 'message-complete', messageId: string }
    | { type: 'error', code: string, message: string }

/**
 * Slim wrapper around an h3 EventStream. Lets unit tests inject an in-memory
 * collector (an array push) instead of opening a real h3 EventStream.
 */
export interface ChatSseSink {
  send: (event: ChatStreamEvent) => Promise<void>
  close: () => Promise<void>
}

export interface PermissionGate {
  permission: Permission
  scope: PermissionScope
  scopeId?: string
}

export interface PermissionGuard {
  /** Resolves when permission granted; throws createError(403) on refusal. */
  ensure: (gate: PermissionGate) => Promise<void>
}

export interface ChatHandlerDeps {
  conversationsService: ConversationsService
  messagesService: MessagesService
  auditService: AuditService
  aiProviderService: AiProviderService
  /** Service deps used to populate the per-request MCP registry. */
  kbEntryService: KbEntryService
  kbCategoryService: KbCategoryService
  kbTagService: KbTagService
  todoService: TodoService
  /** Drizzle handle used by the project read tools (T-4.7). */
  db: DatabaseClient
  /** Permission guard — bound to the H3 event by the caller. */
  permissionGuard: PermissionGuard
  /**
   * Maximum loop iterations per HTTP request. Defends against accidental
   * tool-call infinite loops; callers can pass a small number in tests.
   * Default 10.
   */
  maxLoopIterations?: number
}

export interface RunChatArgs {
  conversationId: string
  organisationId: string
  userId: string
  /** New user message text. */
  userText: string
  /** SSE sink — created by the route handler. */
  sink: ChatSseSink
  /** Optional abort signal — wired to `event.node.req` in the route. */
  abortSignal?: AbortSignal
}

export interface ResumeFromConfirmationArgs {
  conversationId: string
  organisationId: string
  userId: string
  /** The pending audit row id to re-invoke. T-3.12 reads this from the route. */
  actionId: string
  sink: ChatSseSink
  abortSignal?: AbortSignal
}

export interface ResumeFromCancellationArgs {
  conversationId: string
  organisationId: string
  userId: string
  /** The pending audit row id to mark cancelled. T-3.12 reads this from the route. */
  actionId: string
  sink: ChatSseSink
  abortSignal?: AbortSignal
}

export interface ChatHandler {
  run: (args: RunChatArgs) => Promise<void>
  resumeFromConfirmation: (args: ResumeFromConfirmationArgs) => Promise<void>
  resumeFromCancellation: (args: ResumeFromCancellationArgs) => Promise<void>
}

// ─── Input schemas ──────────────────────────────────────────────────────────

const USER_MESSAGE_MAX = 50_000

export const sendMessageBodySchema = z.object({
  content: z.string().trim().min(1).max(USER_MESSAGE_MAX),
})
export type SendMessageBody = z.infer<typeof sendMessageBodySchema>

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Build a system prompt: workspace context, today's date, and any
 * conversation- or workspace-level system prompt overrides.
 */
const buildSystemPrompt = (args: {
  authorName: string
  todayIso: string
  workspaceSystemPrompt: string | null
  conversationSystemPrompt: string | null
}): string => {
  const lines = [
    `You are ${args.authorName}, an AI assistant embedded in the user's personal hub.`,
    `Today's date: ${args.todayIso}.`,
    'You can call tools to search the knowledge base, manage todos, and (when the conversation is in read-write mode) create or update entries.',
    'Prefer concise, accurate answers. When uncertain, ask before performing a write.',
  ]
  if (args.workspaceSystemPrompt && args.workspaceSystemPrompt.trim().length > 0)
    lines.push('', args.workspaceSystemPrompt.trim())
  if (args.conversationSystemPrompt && args.conversationSystemPrompt.trim().length > 0)
    lines.push('', args.conversationSystemPrompt.trim())
  return lines.join('\n')
}

/**
 * Translate a persisted message row into AI SDK `ModelMessage` shape. We
 * stored messages with whatever structured-content blocks the chat handler
 * appended on each turn — so the row content is already AI-SDK-shaped JSON
 * for assistant + tool_result roles. User rows store `[{ type:'text', text }]`.
 */
const rowToModelMessage = (row: OrchestratorMessage): ModelMessage | null => {
  const content = row.content as unknown
  switch (row.role) {
    case 'user': {
      // User rows store a string content (we only support text inputs at
      // this stage — REQ-ORCH-1). Accept either a plain string OR an
      // SDK-shaped array for forward compatibility.
      if (typeof content === 'string')
        return { role: 'user', content }
      if (Array.isArray(content))
        return { role: 'user', content: content as never }
      return null
    }
    case 'assistant': {
      // Assistant rows are always SDK-shaped content arrays — text + tool-call
      // blocks (no tool-result blocks; those are persisted as `tool_result`
      // rows). Pass through verbatim.
      if (Array.isArray(content))
        return { role: 'assistant', content: content as never }
      if (typeof content === 'string')
        return { role: 'assistant', content }
      return null
    }
    case 'tool_result': {
      // Tool-result rows: array of `{ type:'tool-result', toolCallId, toolName, output }`.
      if (Array.isArray(content)) {
        return {
          role: 'tool',
          content: content as never,
        } as ToolModelMessage
      }
      return null
    }
    default:
      return null
  }
}

/** Assistant content blocks we persist — text + tool-call parts. */
type AssistantContentBlock
  = | { type: 'text', text: string }
    | ToolCallPart

/**
 * Derive a synthetic toolCallId for a tool result that is being re-emitted
 * after a confirmation. The original toolCallId from the assistant's
 * tool-call block is the canonical match, but we don't have a reverse index
 * audit-row → toolCallId, so we use the audit id with a stable prefix. The
 * model only needs the ID to be present and unique within a conversation;
 * it does not need to round-trip through us.
 */
const deriveToolCallId = (toolName: string, actionId: string): string =>
  `confirm_${toolName}_${actionId}`

/** Build the JSON-stringified output expected by `ToolResultPart`. */
const buildToolResultPart = (
  toolCallId: string,
  toolName: string,
  result: unknown,
): ToolResultPart => ({
  type: 'tool-result',
  toolCallId,
  toolName,
  output: { type: 'json', value: (result ?? null) as never },
})

// ─── Chat handler implementation ────────────────────────────────────────────

const DEFAULT_MAX_LOOP_ITERATIONS = 10

export const createChatHandler = (deps: ChatHandlerDeps): ChatHandler => {
  const {
    conversationsService,
    messagesService,
    auditService,
    aiProviderService,
    kbEntryService,
    kbCategoryService,
    kbTagService,
    todoService,
    db,
    permissionGuard,
    maxLoopIterations = DEFAULT_MAX_LOOP_ITERATIONS,
  } = deps

  /**
   * Build the per-request MCP registry. Always registers read tools; adds
   * write tools when the conversation is in `read_write` mode (REQ-ORCH-3).
   */
  const buildRegistry = (mode: 'read_only' | 'read_write') => {
    const server = createMcpServer()
    registerReadTools(server, {
      kbEntryService,
      kbCategoryService,
      kbTagService,
      todoService,
      db,
    })
    if (mode === 'read_write') {
      registerWriteToolsKb(server, { kbEntryService, kbCategoryService, kbTagService })
      registerWriteToolsTodo(server, { todoService, kbEntryService })
    }
    return server
  }

  /**
   * Common pre-flight: load the conversation, gate permissions, resolve the
   * model + author name, build the registry + ai-client. Returns the bag the
   * loop needs to drive `streamText` and `auditedInvoke`.
   */
  const prepareTurn = async (args: {
    conversationId: string
    organisationId: string
    userId: string
  }) => {
    // 1. Load conversation (404 surfaces as OrchestratorConversationNotFoundError).
    const { conversation } = await conversationsService.get({
      id: args.conversationId,
      organisationId: args.organisationId,
      includeMessages: false,
    })

    // 2. Permission gate. `orchestrator:use` for any conversation;
    //    `orchestrator:write` additionally for `read_write` mode (REQ-ORCH-3).
    await permissionGuard.ensure({
      permission: 'orchestrator:use' as Permission,
      scope: 'organisation',
      scopeId: args.organisationId,
    })
    if (conversation.mode === 'read_write') {
      await permissionGuard.ensure({
        permission: 'orchestrator:write' as Permission,
        scope: 'organisation',
        scopeId: args.organisationId,
      })
    }

    // 3. Build registry + ai-client (per-request — see file header).
    const mcpServer = buildRegistry(conversation.mode as 'read_only' | 'read_write')
    const aiClient = createOrchestratorAiClient({
      aiProviderService,
      conversationsService,
      mcpServer,
    })
    const resolved = await aiClient.resolveForConversation({
      conversationId: args.conversationId,
      organisationId: args.organisationId,
    })

    // 4. Workspace settings (history limit + workspace-level system prompt).
    const workspaceSettings = await aiProviderService.getWorkspaceSettings({
      organisationId: args.organisationId,
    })

    return { conversation, resolved, mcpServer, aiClient, workspaceSettings }
  }

  /**
   * Run one model turn: stream text deltas, collect tool calls, persist the
   * assistant message. Returns the captured tool calls so the outer loop can
   * decide whether to invoke them or stop.
   */
  const streamOneTurn = async (args: {
    aiClient: ReturnType<typeof createOrchestratorAiClient>
    resolved: Awaited<ReturnType<ReturnType<typeof createOrchestratorAiClient>['resolveForConversation']>>
    history: OrchestratorMessage[]
    toolContext: McpToolContext
    systemPrompt: string
    sink: ChatSseSink
    abortSignal?: AbortSignal
    conversationId: string
  }): Promise<{
    assistantMessageId: string
    toolCalls: Array<{ toolCallId: string, toolName: string, input: unknown }>
  }> => {
    const messages: ModelMessage[] = args.history
      .map(rowToModelMessage)
      .filter((m): m is ModelMessage => m !== null)

    const { stream } = args.aiClient.streamChat({
      conversation: args.resolved.conversation,
      modelClient: args.resolved.modelClient,
      messages,
      toolContext: args.toolContext,
      systemPrompt: args.systemPrompt,
      abortSignal: args.abortSignal,
    })

    const assistantMessageId = ulid()
    let textBuffer = ''
    const toolCalls: Array<{ toolCallId: string, toolName: string, input: unknown }> = []

    // Iterate the AI SDK fullStream. Chunks of interest: `text-delta`,
    // `tool-call`, `error`. We tolerate unknown chunk types by ignoring them.
    for await (const chunk of stream.fullStream as AsyncIterable<TextStreamPart<ToolSet>>) {
      const c = chunk as { type: string } & Record<string, unknown>
      if (c.type === 'text-delta') {
        // AI SDK 6 uses `text` on `text-delta` chunks.
        const delta = (c.text as string | undefined) ?? (c.delta as string | undefined) ?? ''
        if (delta) {
          textBuffer += delta
          await args.sink.send({ type: 'text-delta', messageId: assistantMessageId, delta })
        }
      }
      else if (c.type === 'tool-call') {
        const toolCallId = String(c.toolCallId ?? c.id ?? '')
        const toolName = String(c.toolName ?? '')
        const input = c.input ?? c.args ?? {}
        if (toolCallId && toolName) {
          toolCalls.push({ toolCallId, toolName, input })
          await args.sink.send({ type: 'tool-call', toolCallId, toolName, input })
        }
      }
      else if (c.type === 'error') {
        const message = c.error instanceof Error
          ? c.error.message
          : (typeof c.error === 'string' ? c.error : 'stream_error')
        await args.sink.send({ type: 'error', code: 'stream_error', message })
      }
      // Other chunk types (`finish`, `step-start`, `tool-input-start`, etc.)
      // are not part of our SSE vocabulary; we let them pass.
    }

    // Persist the assistant turn. Content blocks: text first (if any), then
    // each tool-call. If nothing came through (rare error case) persist an
    // empty text so the row exists.
    const blocks: AssistantContentBlock[] = []
    if (textBuffer.length > 0)
      blocks.push({ type: 'text', text: textBuffer })
    for (const call of toolCalls) {
      blocks.push({
        type: 'tool-call',
        toolCallId: call.toolCallId,
        toolName: call.toolName,
        input: call.input as never,
      })
    }
    if (blocks.length === 0)
      blocks.push({ type: 'text', text: '' })

    await messagesService.append({
      id: assistantMessageId,
      conversationId: args.conversationId,
      role: 'assistant',
      content: blocks,
    })

    return { assistantMessageId, toolCalls }
  }

  /**
   * Execute a list of tool calls through `auditedInvoke`. Returns either:
   *   - `kind: 'continue'` with tool-result messages persisted; the outer
   *     loop should run another model turn.
   *   - `kind: 'paused'` if any call gated on confirmation. The SSE
   *     `confirmation_required` event is already emitted; caller should
   *     close the stream.
   */
  const executeToolCalls = async (args: {
    mcpServer: ReturnType<typeof createMcpServer>
    toolContext: McpToolContext
    modelId: string
    conversationId: string
    organisationId: string
    userId: string
    assistantMessageId: string
    toolCalls: Array<{ toolCallId: string, toolName: string, input: unknown }>
    sink: ChatSseSink
  }): Promise<{ kind: 'continue' } | { kind: 'paused' }> => {
    for (const call of args.toolCalls) {
      let outcome: AuditedInvokeOutcome<unknown>
      try {
        outcome = await auditedInvoke({
          server: args.mcpServer,
          audit: auditService,
          name: call.toolName,
          input: call.input,
          ctx: args.toolContext,
          modelId: args.modelId,
        })
      }
      catch (err) {
        // Tool-level failure — emit an error tool-result so the model can
        // recover on the next turn. Persist a tool_result row carrying the
        // error message; the audit layer already wrote a `failed` row.
        const message = err instanceof Error ? err.message : String(err)
        const code = err instanceof McpToolError ? err.name : 'tool_execution_error'
        const errorBlock = {
          type: 'tool-result' as const,
          toolCallId: call.toolCallId,
          toolName: call.toolName,
          output: { type: 'json', value: { error: code, message } as never },
        }
        await messagesService.append({
          conversationId: args.conversationId,
          role: 'tool_result',
          content: [errorBlock],
        })
        await args.sink.send({
          type: 'tool-result',
          toolCallId: call.toolCallId,
          actionId: '',
          result: { error: code, message },
        })
        continue
      }

      if (outcome.kind === 'confirmation_required') {
        await args.sink.send({
          type: 'confirmation_required',
          toolCallId: call.toolCallId,
          actionId: outcome.actionId,
          toolName: outcome.toolName,
          input: outcome.input,
          affectedCount: outcome.affectedCount,
          reason: outcome.reason,
        })
        // Bind the pending audit row to the assistant message that requested it.
        if (outcome.actionId)
          await auditService.attachMessageId(outcome.actionId, args.assistantMessageId)
        return { kind: 'paused' }
      }

      // Executed: persist a tool_result message and emit SSE.
      const part = buildToolResultPart(call.toolCallId, call.toolName, outcome.result.result)
      const toolResultRow = await messagesService.append({
        conversationId: args.conversationId,
        role: 'tool_result',
        content: [part],
      })
      await args.sink.send({
        type: 'tool-result',
        toolCallId: call.toolCallId,
        actionId: outcome.actionId,
        result: outcome.result.result,
      })
      // Late-bind the audit row to the tool_result message id so the audit
      // log can deep-link to the message that captured the tool's output.
      if (outcome.actionId)
        await auditService.attachMessageId(outcome.actionId, toolResultRow.id)
    }
    return { kind: 'continue' }
  }

  // ─── Public: run ────────────────────────────────────────────────────────

  const run = async (args: RunChatArgs): Promise<void> => {
    // Permission errors / 404s propagate as HTTP errors before SSE even opens.
    // The route handler is responsible for catching these and emitting an
    // error response — we deliberately don't wrap-and-rethrow here.
    const prep = await prepareTurn({
      conversationId: args.conversationId,
      organisationId: args.organisationId,
      userId: args.userId,
    })

    // Persist the user message before any model call so we don't lose it on
    // a stream failure.
    await messagesService.append({
      conversationId: args.conversationId,
      role: 'user',
      content: args.userText,
    })

    const toolContext: McpToolContext = {
      organisationId: args.organisationId,
      userId: args.userId,
      conversationId: args.conversationId,
      mode: prep.conversation.mode as 'read_only' | 'read_write',
      authorName: prep.resolved.authorName,
    }

    const systemPrompt = buildSystemPrompt({
      authorName: prep.resolved.authorName,
      todayIso: new Date().toISOString().slice(0, 10),
      workspaceSystemPrompt: prep.workspaceSettings.systemPrompt ?? null,
      conversationSystemPrompt: prep.conversation.systemPrompt ?? null,
    })

    const historyLimit = prep.workspaceSettings.historyLimit ?? 30

    try {
      for (let iteration = 0; iteration < maxLoopIterations; iteration += 1) {
        const history = await messagesService.loadHistory({
          conversationId: args.conversationId,
          limit: historyLimit,
        })

        const turn = await streamOneTurn({
          aiClient: prep.aiClient,
          resolved: prep.resolved,
          history,
          toolContext,
          systemPrompt,
          sink: args.sink,
          abortSignal: args.abortSignal,
          conversationId: args.conversationId,
        })

        if (turn.toolCalls.length === 0) {
          await args.sink.send({ type: 'message-complete', messageId: turn.assistantMessageId })
          break
        }

        const result = await executeToolCalls({
          mcpServer: prep.mcpServer,
          toolContext,
          modelId: prep.resolved.modelRow.id,
          conversationId: args.conversationId,
          organisationId: args.organisationId,
          userId: args.userId,
          assistantMessageId: turn.assistantMessageId,
          toolCalls: turn.toolCalls,
          sink: args.sink,
        })

        if (result.kind === 'paused')
          break
      }
      await messagesService.bumpConversationUpdatedAt(args.conversationId)
    }
    catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      await args.sink.send({ type: 'error', code: 'chat_loop_error', message })
    }
    finally {
      await args.sink.close()
    }
  }

  /**
   * Drive the model loop after a confirmation re-invocation has persisted a
   * fresh tool_result. Mirrors `run`'s loop body but does NOT append a new
   * user message and does NOT close the sink (caller does).
   */
  const runFinalLoop = async (
    args: ResumeFromConfirmationArgs | ResumeFromCancellationArgs,
    prep: Awaited<ReturnType<typeof prepareTurn>>,
    toolContext: McpToolContext,
    systemPrompt: string,
    historyLimit: number,
  ): Promise<void> => {
    // Use a fresh ctx (no confirmationToken) for any further tool calls in
    // subsequent turns.
    const onwardCtx: McpToolContext = { ...toolContext, confirmationToken: undefined }

    for (let iteration = 0; iteration < maxLoopIterations; iteration += 1) {
      const history = await messagesService.loadHistory({
        conversationId: args.conversationId,
        limit: historyLimit,
      })

      const turn = await streamOneTurn({
        aiClient: prep.aiClient,
        resolved: prep.resolved,
        history,
        toolContext: onwardCtx,
        systemPrompt,
        sink: args.sink,
        abortSignal: args.abortSignal,
        conversationId: args.conversationId,
      })

      if (turn.toolCalls.length === 0) {
        await args.sink.send({ type: 'message-complete', messageId: turn.assistantMessageId })
        break
      }

      const result = await executeToolCalls({
        mcpServer: prep.mcpServer,
        toolContext: onwardCtx,
        modelId: prep.resolved.modelRow.id,
        conversationId: args.conversationId,
        organisationId: args.organisationId,
        userId: args.userId,
        assistantMessageId: turn.assistantMessageId,
        toolCalls: turn.toolCalls,
        sink: args.sink,
      })

      if (result.kind === 'paused')
        break
    }
    await messagesService.bumpConversationUpdatedAt(args.conversationId)
  }

  /**
   * Shared validation for confirm + cancel: the action must exist in the
   * caller's org AND in the supplied conversation AND be in
   * `pending_confirmation`. Throws HTTP errors that the route handlers turn
   * into 404 / 409 responses (no SSE opened in that case). Returns the
   * hydrated audit row when valid.
   */
  const loadPendingAction = async (args: {
    actionId: string
    conversationId: string
    organisationId: string
    /**
     * `confirm` accepts an already-`confirmed` row (idempotent re-entry after
     * a flaky network on the client). `cancel` requires strict
     * `pending_confirmation`.
     */
    acceptStatuses: ReadonlyArray<'pending_confirmation' | 'confirmed'>
  }) => {
    const audit = await auditService.findById(args.actionId, args.organisationId)
    if (!audit || audit.conversationId !== args.conversationId) {
      throw createError({
        statusCode: 404,
        statusMessage: 'orchestrator.action.not_found',
      })
    }
    if (!args.acceptStatuses.includes(audit.status as 'pending_confirmation' | 'confirmed')) {
      throw createError({
        statusCode: 409,
        statusMessage: 'orchestrator.action.not_pending',
        data: { status: audit.status },
      })
    }
    return audit
  }

  // ─── Public: resumeFromConfirmation ─────────────────────────────────────

  const resumeFromConfirmation = async (args: ResumeFromConfirmationArgs): Promise<void> => {
    const audit = await loadPendingAction({
      actionId: args.actionId,
      conversationId: args.conversationId,
      organisationId: args.organisationId,
      acceptStatuses: ['pending_confirmation', 'confirmed'],
    })

    // Permission errors / 404s propagate as HTTP errors — see `run`.
    const prep = await prepareTurn({
      conversationId: args.conversationId,
      organisationId: args.organisationId,
      userId: args.userId,
    })

    const toolContext: McpToolContext = {
      organisationId: args.organisationId,
      userId: args.userId,
      conversationId: args.conversationId,
      mode: prep.conversation.mode as 'read_only' | 'read_write',
      authorName: prep.resolved.authorName,
      // Presence/absence is the gate at the registry layer; we use the
      // actionId itself as the opaque token.
      confirmationToken: args.actionId,
    }

    const systemPrompt = buildSystemPrompt({
      authorName: prep.resolved.authorName,
      todayIso: new Date().toISOString().slice(0, 10),
      workspaceSystemPrompt: prep.workspaceSettings.systemPrompt ?? null,
      conversationSystemPrompt: prep.conversation.systemPrompt ?? null,
    })

    const historyLimit = prep.workspaceSettings.historyLimit ?? 30

    try {
      // 1. Re-invoke the gated tool — auditedInvoke uses `priorActionId` to
      //    keep one audit row per logical call.
      let outcome: AuditedInvokeOutcome<unknown>
      try {
        outcome = await auditedInvoke({
          server: prep.mcpServer,
          audit: auditService,
          name: audit.toolName,
          input: audit.parameters,
          ctx: toolContext,
          modelId: prep.resolved.modelRow.id,
          priorActionId: args.actionId,
        })
      }
      catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        const code = err instanceof McpToolError ? err.name : 'tool_execution_error'
        // Persist an error tool_result so the loop can continue, then drive
        // a final assistant turn so the model can react.
        await messagesService.append({
          conversationId: args.conversationId,
          role: 'tool_result',
          content: [{
            type: 'tool-result',
            toolCallId: deriveToolCallId(audit.toolName, args.actionId),
            toolName: audit.toolName,
            output: { type: 'json', value: { error: code, message } as never },
          }],
        })
        await args.sink.send({
          type: 'tool-result',
          toolCallId: deriveToolCallId(audit.toolName, args.actionId),
          actionId: args.actionId,
          result: { error: code, message },
        })
        await runFinalLoop(args, prep, toolContext, systemPrompt, historyLimit)
        return
      }

      if (outcome.kind === 'confirmation_required') {
        // Should not happen on a re-entry with a token, but defensively
        // re-emit and exit.
        await args.sink.send({
          type: 'confirmation_required',
          toolCallId: deriveToolCallId(audit.toolName, args.actionId),
          actionId: outcome.actionId,
          toolName: outcome.toolName,
          input: outcome.input,
          affectedCount: outcome.affectedCount,
          reason: outcome.reason,
        })
        return
      }

      // 2. Persist the executed tool_result and emit it.
      const toolCallId = deriveToolCallId(audit.toolName, args.actionId)
      const part = buildToolResultPart(toolCallId, audit.toolName, outcome.result.result)
      const row = await messagesService.append({
        conversationId: args.conversationId,
        role: 'tool_result',
        content: [part],
      })
      await args.sink.send({
        type: 'tool-result',
        toolCallId,
        actionId: outcome.actionId,
        result: outcome.result.result,
      })
      await auditService.attachMessageId(outcome.actionId, row.id)

      // 3. Drive the loop forward — model gets the tool result and may
      //    emit another assistant turn (text and/or further tool calls).
      await runFinalLoop(args, prep, toolContext, systemPrompt, historyLimit)
    }
    catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      await args.sink.send({ type: 'error', code: 'chat_loop_error', message })
    }
    finally {
      await args.sink.close()
    }
  }

  // ─── Public: resumeFromCancellation ─────────────────────────────────────

  /**
   * User clicked Cancel on a pending tool call. Flip the audit row to
   * `cancelled`, inject a synthetic `tool_result` message so the model sees
   * the cancellation as a tool result on its next turn, and drive a final
   * model turn over SSE so it can react (typically: acknowledge the cancel).
   *
   * Validation throws HTTP 404 / 409 before opening SSE so the route can
   * surface the right status code (mirrors `resumeFromConfirmation`).
   */
  const resumeFromCancellation = async (args: ResumeFromCancellationArgs): Promise<void> => {
    const audit = await loadPendingAction({
      actionId: args.actionId,
      conversationId: args.conversationId,
      organisationId: args.organisationId,
      // Only strictly-pending rows can be cancelled. A row already
      // `confirmed` is mid-execution — it is past the cancel gate.
      acceptStatuses: ['pending_confirmation'],
    })

    // Permission errors / 404s propagate as HTTP errors before SSE opens —
    // see `run`. We require ORCHESTRATOR_USE for any conversation, plus
    // ORCHESTRATOR_WRITE for read_write mode (symmetric with `confirm`); the
    // latter is enforced via `prepareTurn`.
    const prep = await prepareTurn({
      conversationId: args.conversationId,
      organisationId: args.organisationId,
      userId: args.userId,
    })

    const toolContext: McpToolContext = {
      organisationId: args.organisationId,
      userId: args.userId,
      conversationId: args.conversationId,
      mode: prep.conversation.mode as 'read_only' | 'read_write',
      authorName: prep.resolved.authorName,
    }

    const systemPrompt = buildSystemPrompt({
      authorName: prep.resolved.authorName,
      todayIso: new Date().toISOString().slice(0, 10),
      workspaceSystemPrompt: prep.workspaceSettings.systemPrompt ?? null,
      conversationSystemPrompt: prep.conversation.systemPrompt ?? null,
    })

    const historyLimit = prep.workspaceSettings.historyLimit ?? 30

    try {
      // 1. Flip the audit row → cancelled (sets `cancelledAt`).
      await auditService.recordCancelled(args.actionId)

      // 2. Persist a synthetic tool_result message so the model sees the
      //    cancellation. Reuses the same synthetic toolCallId scheme as the
      //    confirm path so a future round-trip can correlate.
      const toolCallId = deriveToolCallId(audit.toolName, args.actionId)
      const cancelOutput = { cancelled: true, reason: 'user_cancelled' as const }
      const part: ToolResultPart = {
        type: 'tool-result',
        toolCallId,
        toolName: audit.toolName,
        output: { type: 'json', value: cancelOutput as never },
      }
      const row = await messagesService.append({
        conversationId: args.conversationId,
        role: 'tool_result',
        content: [part],
      })

      // Late-bind the audit row to the tool_result message id (audit log
      // deep-link to the synthesised cancellation row).
      await auditService.attachMessageId(args.actionId, row.id)

      // 3. Surface the synthetic tool result over SSE so the client sees the
      //    same event vocabulary as the confirm path.
      await args.sink.send({
        type: 'tool-result',
        toolCallId,
        actionId: args.actionId,
        result: cancelOutput,
      })

      // 4. Drive the model loop forward — the model receives the
      //    cancellation tool result and emits its next turn.
      await runFinalLoop(args, prep, toolContext, systemPrompt, historyLimit)
    }
    catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      await args.sink.send({ type: 'error', code: 'chat_loop_error', message })
    }
    finally {
      await args.sink.close()
    }
  }

  return { run, resumeFromConfirmation, resumeFromCancellation }
}

// ─── h3 SSE adapter ─────────────────────────────────────────────────────────

/**
 * Wrap an h3 EventStream in a {@link ChatSseSink}. Lives here so the route
 * file stays minimal; tests construct an in-memory sink instead.
 */
export const adaptH3EventStreamToSink = (stream: EventStream): ChatSseSink => ({
  send: async (event: ChatStreamEvent) => {
    await stream.push({ event: event.type, data: JSON.stringify(event) })
  },
  close: async () => {
    await stream.close()
  },
})

/**
 * Build a permission guard backed by the H3 event's session — used by the
 * route handler. Tests inject a stub instead.
 */
export const createH3PermissionGuard = (
  event: H3Event,
  requirePermission: (event: H3Event, opts: {
    permission: Permission
    scope: PermissionScope
    getScopeId?: () => string | undefined
  }) => Promise<void>,
): PermissionGuard => ({
  ensure: async (gate: PermissionGate) => {
    await requirePermission(event, {
      permission: gate.permission,
      scope: gate.scope,
      getScopeId: () => gate.scopeId,
    })
  },
})

// ─── Re-exports ─────────────────────────────────────────────────────────────

export { ConfirmationRequiredError, OrchestratorConversationNotFoundError }
