import { resolveWorkspace } from '~~/server/features/kb/workspace'
/**
 * POST /api/orchestrator/conversations — create a new conversation in the
 * active workspace (T-3.9, REQ-ORCH-1, REQ-ORCH-3).
 *
 * Body fields are all optional: `title` defaults to '', `mode` defaults to
 * `'read_only'` (REQ-ORCH-3), `modelId` defaults to null (resolution falls
 * through to workspace default → global default at chat time).
 *
 * Permission: `orchestrator:use` on the active workspace organisation.
 */
import {
  readOrchestratorBody,
  runOrchestratorServiceCall,
} from '~~/server/features/orchestrator/api-utils'
import {
  createConversationSchema,
  serialiseConversation,
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

  const input = await readOrchestratorBody(event, createConversationSchema)

  const conversation = await runOrchestratorServiceCall(() =>
    container.conversationsService.create({
      organisationId: ws.organisationId,
      userId: ws.userId,
      title: input.title,
      mode: input.mode,
      modelId: input.modelId ?? null,
    }),
  )

  return { conversation: serialiseConversation(conversation) }
})
