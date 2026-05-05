/**
 * POST /api/orchestrator/conversations/[id]/cancel — abort a paused tool
 * call (T-3.12). Body: `{ actionId: string }`. Marks the audit row
 * `cancelled`, injects a synthetic `tool_result` describing the cancellation
 * so the model can react, and streams the model's next turn over SSE using
 * the same event vocabulary as `/messages` (T-3.11).
 *
 * Refs: REQ-ORCH-4, DESIGN-CHAT step 4.
 *
 * Permissions: `orchestrator:use` AND `orchestrator:write` (symmetric with
 * `confirm`; cancelling a write is a write-side operation against the
 * conversation's tool history). Both gates are applied inside
 * `chatHandler.resumeFromCancellation` via `prepareTurn`.
 *
 * Validation errors thrown *before* SSE opens:
 *   - 400 `validation.failed` — body fails the Zod schema.
 *   - 404 `orchestrator.action.not_found` — actionId missing / cross-org /
 *     wrong conversation.
 *   - 409 `orchestrator.action.not_pending` — row exists but is not in
 *     `pending_confirmation` (a `confirmed` row is mid-execution and is
 *     past the cancel gate).
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

const cancelBodySchema = z.object({
  actionId: z.string().trim().length(26).regex(/^[0-9A-HJKMNP-TV-Z]+$/i),
})

export default defineEventHandler(async (event) => {
  const ws = await resolveWorkspace(event)
  const id = getRequiredParam(event, 'id', 'orchestrator.conversation.id_required')
  const body = await readOrchestratorBody(event, cancelBodySchema)

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
    vaultService: container.vaultService,
    vaultSessionStore: container.vaultSessionStore,
    rbacService: container.rbacService,
  })

  const stream = createEventStream(event)
  const sink = adaptH3EventStreamToSink(stream)

  const abortController = new AbortController()
  event.node.req.on('close', () => {
    abortController.abort()
  })

  const responsePromise = stream.send()

  void handler
    .resumeFromCancellation({
      conversationId: id,
      organisationId: ws.organisationId,
      userId: ws.userId,
      sessionId: event.context.session?.id,
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
