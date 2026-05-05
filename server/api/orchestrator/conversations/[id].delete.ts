import { resolveWorkspace } from '~~/server/features/kb/workspace'
/**
 * DELETE /api/orchestrator/conversations/[id] — soft-delete a conversation
 * (T-3.9). Idempotent: deleting a missing or already-deleted row succeeds
 * silently to match the `clearWorkspaceCredentials` precedent.
 *
 * The audit log retains FK references (`orchestrator_actions.conversation_id`
 * is a FK to this table — schema keeps the row available via soft delete).
 *
 * Permission: `orchestrator:use`.
 */
import { getRequiredParam } from '~~/server/features/orchestrator/api-utils'
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

  await container.conversationsService.softDelete({
    id,
    organisationId: ws.organisationId,
  })

  return { success: true }
})
