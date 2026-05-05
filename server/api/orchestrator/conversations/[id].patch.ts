import { resolveWorkspace } from '~~/server/features/kb/workspace'
/**
 * PATCH /api/orchestrator/conversations/[id] — partial update to title, mode
 * (REQ-ORCH-3, mid-conversation toggle is allowed), or modelId (capability-
 * validated against `ai_models`).
 *
 * Empty body returns 400 `validation.failed` (Zod refine).
 * Cross-org / soft-deleted target returns 404 `orchestrator.conversation.not_found`.
 *
 * Permission: `orchestrator:use`.
 */
import {
  getRequiredParam,
  readOrchestratorBody,
  runOrchestratorServiceCall,
} from '~~/server/features/orchestrator/api-utils'
import {
  serialiseConversation,
  updateConversationSchema,
} from '~~/server/features/orchestrator/conversation-schemas'
import { PERMISSIONS } from '~~/server/features/rbac/permissions'
import { requirePermission } from '~~/server/features/rbac/rbac.guard'
import { container } from '~~/server/utils/container'

export default defineEventHandler(async (event) => {
  const ws = await resolveWorkspace(event)

  await requirePermission(event, {
    permission: PERMISSIONS.ORCHESTRATOR_USE,
    scope: 'organisation',
    getScopeId: () => ws.organisationId,
  })

  const id = getRequiredParam(event, 'id', 'orchestrator.conversation.id_required')
  const input = await readOrchestratorBody(event, updateConversationSchema)

  const conversation = await runOrchestratorServiceCall(() =>
    container.conversationsService.update({
      id,
      organisationId: ws.organisationId,
      title: input.title,
      mode: input.mode,
      modelId: input.modelId,
    }),
  )

  return { conversation: serialiseConversation(conversation) }
})
