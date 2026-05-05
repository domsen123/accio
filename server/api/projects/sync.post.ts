/**
 * POST /api/projects/sync — manual workspace-wide sync trigger (T-4.5).
 *
 * Runs `ghSyncService.syncAllTracked` for the active workspace's organisation.
 * The cron task (`gh:sync-all`) does the same thing for every org; this route
 * exists so the UI's workspace-wide "Sync all" button doesn't have to wait for
 * the next tick. T-4.6 adds per-repo manual sync as a separate route.
 *
 * Permission: `project:manage` on the active workspace organisation.
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
    container.ghSyncService.syncAllTracked({ organisationId: ws.organisationId }),
  )

  return { repoResults: result.repoResults }
})
