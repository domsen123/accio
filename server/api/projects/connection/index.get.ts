/**
 * GET /api/projects/connection — connection status for the active workspace
 * (T-4.6, REQ-PROJ-1). Never returns the encrypted/plaintext token.
 *
 * Permission: `project:read`.
 */
import { resolveWorkspace } from '~~/server/features/kb/workspace'
import { serialiseConnectionStatus } from '~~/server/features/projects/api-schemas'
import { runProjectsServiceCall } from '~~/server/features/projects/api-utils'
import { PERMISSIONS } from '~~/server/features/rbac/permissions'
import { requirePermission } from '~~/server/features/rbac/rbac.guard'
import { container } from '~~/server/utils/container'

export default defineEventHandler(async (event) => {
  const ws = await resolveWorkspace(event)

  await requirePermission(event, {
    permission: PERMISSIONS.PROJECT_READ,
    scope: 'organisation',
    getScopeId: () => ws.organisationId,
  })

  const status = await runProjectsServiceCall(() =>
    container.ghConnectionsService.getStatus({ organisationId: ws.organisationId }),
  )

  return serialiseConnectionStatus(status)
})
