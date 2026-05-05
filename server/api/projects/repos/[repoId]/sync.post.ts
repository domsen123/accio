/**
 * POST /api/projects/repos/[repoId]/sync — manual per-repo "Sync now"
 * (T-4.6, REQ-PROJ-3). Distinct from the workspace-wide
 * `POST /api/projects/sync` (T-4.5).
 *
 * Permission: `project:manage`.
 */
import { resolveWorkspace } from '~~/server/features/kb/workspace'
import { serialiseRepo } from '~~/server/features/projects/api-schemas'
import {
  getRequiredParam,
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

  const repoId = getRequiredParam(event, 'repoId', 'gh.repo.id_required')

  const result = await runProjectsServiceCall(() =>
    container.ghSyncService.syncRepo({
      organisationId: ws.organisationId,
      repoId,
    }),
  )

  return {
    repo: serialiseRepo(result.repo),
    counts: result.counts,
  }
})
