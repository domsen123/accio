/**
 * POST /api/orchestrator/conversations/[id]/confirm — resume a paused tool
 * call (T-3.12). Body: `{ actionId: string }`. Streams the model's next turn
 * over SSE using the same event vocabulary as
 * `/api/orchestrator/conversations/[id]/messages` (T-3.11).
 *
 * Refs: REQ-ORCH-4, DESIGN-CHAT step 4.
 *
 * Permissions: `orchestrator:use` AND `orchestrator:write` (a confirmation
 * always resumes a write — the read-side tools never gate). Both gates are
 * applied inside `chatHandler.resumeFromConfirmation` via `prepareTurn`.
 *
 * Validation errors thrown *before* SSE opens:
 *   - 400 `validation.failed` — body fails the Zod schema.
 *   - 404 `orchestrator.action.not_found` — actionId missing or cross-org or
 *     for a different conversation. (Existence-leak-safe.)
 *   - 409 `orchestrator.action.not_pending` — row exists but is not in
 *     `pending_confirmation`/`confirmed`.
 *
 * Mid-stream errors surface as SSE `error` events.
 */
import { createEventStream } from 'h3'
import { z } from 'zod'

import { resolveWorkspace } from '~~/server/features/kb/workspace'
import {
  getRequiredParam,
  readOrchestratorBody,
} from '~~/server/features/orchestrator/api-utils'
import {
  adaptH3EventStreamToSink,
  createChatHandler,
  createH3PermissionGuard,
} from '~~/server/features/orchestrator/chat-handler'
import { OrchestratorConversationNotFoundError } from '~~/server/features/orchestrator/errors'
import { requirePermission } from '~~/server/features/rbac/rbac.guard'
import { getDatabase } from '~~/server/infrastructure/database/client'
import { container } from '~~/server/utils/container'

// ULIDs are 26 chars Crockford base32. Loose check: alnum, length 26.
const confirmBodySchema = z.object({
  actionId: z.string().trim().length(26).regex(/^[0-9A-HJKMNP-TV-Z]+$/i),
})

export default defineEventHandler(async (event) => {
  const ws = await resolveWorkspace(event)
  const id = getRequiredParam(event, 'id', 'orchestrator.conversation.id_required')
  const body = await readOrchestratorBody(event, confirmBodySchema)

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

  // Pre-flight validation throws before SSE opens (404 / 409). The chat
  // handler `resumeFromConfirmation` performs the action lookup *and* the
  // permission gates in `prepareTurn`. We surface those throws as HTTP
  // status codes here, then open the SSE stream for the in-loop work.
  //
  // Implementation choice: drive validation by attempting the resume in a
  // pre-stream phase via a thin wrapper. We can't split the call cleanly
  // (`resumeFromConfirmation` opens the stream internally), so instead we
  // open the stream first and let the catch-block convert any *thrown* HTTP
  // error into an SSE `error` event — symmetric with the messages.post.ts
  // route. The client renders the error event uniformly with a status code
  // gleaned from `statusCode` on the error.

  const stream = createEventStream(event)
  const sink = adaptH3EventStreamToSink(stream)

  const abortController = new AbortController()
  event.node.req.on('close', () => {
    abortController.abort()
  })

  const responsePromise = stream.send()

  void handler
    .resumeFromConfirmation({
      conversationId: id,
      organisationId: ws.organisationId,
      userId: ws.userId,
      actionId: body.actionId,
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
