import { resolveWorkspace } from '~~/server/features/kb/workspace'
import {
  getRequiredParam,
  readOrchestratorQuery,
  runOrchestratorServiceCall,
} from '~~/server/features/orchestrator/api-utils'
/**
 * GET /api/orchestrator/conversations/[id] — single conversation with the full
 * immutable message history (T-3.9, REQ-ORCH-1).
 *
 * Query params:
 *   - `includeMessages` (default true) — set to false to return only the
 *     conversation metadata (used by the chat UI when re-fetching after a
 *     PATCH to avoid pulling history again).
 *
 * Behaviour:
 *   - Soft-deleted conversations return 404 (consistent with the list default
 *     hiding them; admins viewing the audit log do not need this endpoint).
 *   - Cross-organisation ids return 404 (no existence leak).
 *
 * Permission: `orchestrator:use`.
 */
import {
  conversationGetQuerySchema,
  serialiseConversation,
  serialiseMessage,
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
  const q = readOrchestratorQuery(event, conversationGetQuerySchema)
  const includeMessages = q.includeMessages ?? true

  const result = await runOrchestratorServiceCall(() =>
    container.conversationsService.get({
      id,
      organisationId: ws.organisationId,
      includeMessages,
    }),
  )

  if (!includeMessages)
    return { conversation: serialiseConversation(result.conversation) }

  return {
    conversation: serialiseConversation(result.conversation),
    messages: (result.messages ?? []).map(serialiseMessage),
  }
})
