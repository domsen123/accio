import { createEventStream } from 'h3'
/**
 * POST /api/orchestrator/conversations/[id]/messages — streaming chat endpoint
 * (T-3.11). Server-Sent Events response carrying the assistant's tokens, any
 * tool-call and tool-result events, and a terminal `message-complete` (or
 * `confirmation_required` if a write tool gates).
 *
 * Refs: REQ-ORCH-1, REQ-ORCH-3, REQ-ORCH-4, DESIGN-CHAT, ADR-006, ADR-010.
 *
 * SSE event vocabulary (each event has `event: <type>` + JSON-encoded `data`):
 *   - `text-delta`            { messageId, delta }
 *   - `tool-call`             { toolCallId, toolName, input }
 *   - `tool-result`           { toolCallId, actionId, result }
 *   - `confirmation_required` { toolCallId, actionId, toolName, input,
 *                               affectedCount, reason: 'class' | 'bulk' }
 *   - `message-complete`      { messageId }
 *   - `error`                 { code, message }
 *
 * After a `confirmation_required` event the stream closes; the client calls
 * `POST .../confirm` (T-3.12) to resume — that opens a new SSE response.
 *
 * Permissions:
 *   - `orchestrator:use` always.
 *   - `orchestrator:write` additionally when the conversation is `read_write`.
 *
 * The route is intentionally thin: parse the body, build dependencies, and
 * delegate to `chatHandler.run` which owns the loop logic.
 */
import { resolveWorkspace } from '~~/server/features/kb/workspace'
import {
  getRequiredParam,
  readOrchestratorBody,
} from '~~/server/features/orchestrator/api-utils'
import {
  adaptH3EventStreamToSink,
  createChatHandler,
  createH3PermissionGuard,
  sendMessageBodySchema,
} from '~~/server/features/orchestrator/chat-handler'
import { OrchestratorConversationNotFoundError } from '~~/server/features/orchestrator/errors'
import { requirePermission } from '~~/server/features/rbac/rbac.guard'
import { getDatabase } from '~~/server/infrastructure/database/client'
import { container } from '~~/server/utils/container'

export default defineEventHandler(async (event) => {
  const ws = await resolveWorkspace(event)
  const id = getRequiredParam(event, 'id', 'orchestrator.conversation.id_required')
  const body = await readOrchestratorBody(event, sendMessageBodySchema)

  // Build a chat handler request-scoped over the H3 event so the permission
  // guard has access to the user session.
  const handler = createChatHandler({
    conversationsService: container.conversationsService,
    messagesService: container.messagesService,
    auditService: container.auditService,
    aiProviderService: container.aiProviderService,
    kbEntryService: container.kbEntryService,
    kbCategoryService: container.kbCategoryService,
    kbTagService: container.kbTagService,
    todoService: container.todoService,
    db: getDatabase('app'),
    permissionGuard: createH3PermissionGuard(event, requirePermission),
  })

  // Open the SSE stream. h3 sets the right headers; we push events as
  // `{ event: <type>, data: <json> }`.
  const stream = createEventStream(event)
  const sink = adaptH3EventStreamToSink(stream)

  // Wire abort to upstream model call. We deliberately do NOT await
  // `handler.run` before sending the stream — `stream.send()` returns the
  // ReadableStream response and our handler runs concurrently, pushing
  // events. We send the response first, then start the loop in the
  // background; if the loop throws (e.g. permission failure during the
  // initial conversation load) we surface an error event before closing.
  const abortController = new AbortController()
  event.node.req.on('close', () => {
    abortController.abort()
  })

  const responsePromise = stream.send()

  // Run the loop. We catch known auth/404 errors and emit them as an SSE
  // error event so the client gets a uniform stream-shaped failure signal.
  void handler
    .run({
      conversationId: id,
      organisationId: ws.organisationId,
      userId: ws.userId,
      userText: body.content,
      sink,
      abortSignal: abortController.signal,
    })
    .catch(async (err) => {
      if (err instanceof OrchestratorConversationNotFoundError) {
        await sink.send({ type: 'error', code: 'orchestrator.conversation.not_found', message: err.message })
      }
      else if (err && typeof err === 'object' && 'statusCode' in err) {
        const status = (err as { statusCode: number }).statusCode
        const code = (err as { statusMessage?: string }).statusMessage ?? 'http_error'
        await sink.send({ type: 'error', code: `${status}_${code}`, message: code })
      }
      else {
        const message = err instanceof Error ? err.message : String(err)
        await sink.send({ type: 'error', code: 'chat_loop_error', message })
      }
      await sink.close()
    })

  return responsePromise
})
