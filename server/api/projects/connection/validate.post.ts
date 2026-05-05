/**
 * POST /api/projects/connection/validate — re-validate the stored PAT
 * (T-4.6, REQ-PROJ-1).
 *
 * Returns `{ valid: true, ghUserLogin, ghUserId, scopes }` on success or
 * `{ valid: false, reason }` for the four documented failure modes
 * (no_connection, invalid_token, insufficient_scope, validation_failed).
 *
 * Permission: `project:manage` — re-validation is part of the connection
 * lifecycle (rotated token / scope drift), so we gate it behind the same
 * permission as `connect`/`revoke`.
 */
import { resolveWorkspace } from '~~/server/features/kb/workspace'
import { runProjectsServiceCall } from '~~/server/features/projects/api-utils'
import { PERMISSIONS } from '~~/server/features/rbac/permissions'
import { requirePermission } from '~~/server/features/rbac/rbac.guard'
import { container } from '~~/server/utils/container'

export default defineEventHandler(async (event) => {
  const ws = await resolveWorkspace(event)

  await requirePermission(event, {
    permission: PERMISSIONS.PROJECT_MANAGE,
    scope: 'organisation',
    getScopeId: () => ws.organisationId,
  })

  const result = await runProjectsServiceCall(() =>
    container.ghConnectionsService.validate({ organisationId: ws.organisationId }),
  )

  return result
})
