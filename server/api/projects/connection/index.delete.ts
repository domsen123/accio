/**
 * DELETE /api/projects/connection[?purgeData=true] — revoke the workspace PAT
 * (T-4.6, REQ-PROJ-1). Defaults to `purgeData=false`: cached repos / issues /
 * pulls / commits survive. Pass `purgeData=true` to additionally drop every
 * `gh_*` row.
 *
 * Permission: `project:manage`.
 */
import { resolveWorkspace } from '~~/server/features/kb/workspace'
import { revokeQuerySchema } from '~~/server/features/projects/api-schemas'
import {
  readProjectsQuery,
  runProjectsServiceCall,
} from '~~/server/features/projects/api-utils'
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

  const q = readProjectsQuery(event, revokeQuerySchema)

  await runProjectsServiceCall(() =>
    container.ghConnectionsService.revoke({
      organisationId: ws.organisationId,
      purgeData: q.purgeData ?? false,
    }),
  )

  return { ok: true, purged: q.purgeData === true }
})
