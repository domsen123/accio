/**
 * DELETE /api/ai/credentials/[providerId] — remove the workspace's stored
 * credential for the provider. Idempotent (deleting a non-existent row is
 * a no-op). Permission: `ai:manage`.
 */
import { getRequiredParam, runAiServiceCall } from '~~/server/features/ai/api-utils'
import { resolveWorkspace } from '~~/server/features/kb/workspace'
import { PERMISSIONS } from '~~/server/features/rbac/permissions'
import { requirePermission } from '~~/server/features/rbac/rbac.guard'
import { container } from '~~/server/utils/container'

export default defineEventHandler(async (event) => {
  const ws = await resolveWorkspace(event)

  await requirePermission(event, {
    permission: PERMISSIONS.AI_MANAGE,
    scope: 'organisation',
    getScopeId: () => ws.organisationId,
  })

  const providerId = getRequiredParam(event, 'providerId', 'ai.provider.id_required')

  await runAiServiceCall(() =>
    container.aiProviderService.clearWorkspaceCredentials({
      organisationId: ws.organisationId,
      providerId,
    }),
  )

  return { success: true }
})
