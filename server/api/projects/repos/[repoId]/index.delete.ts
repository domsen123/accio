/**
 * DELETE /api/projects/repos/[repoId] — purge a tracked repo (T-4.6).
 *
 * Soft-deletes the `gh_repos` row and hard-deletes its cached children
 * (issues / pulls / commits) per `purgeRepo` semantics. Cross-org ids return
 * 404 `gh.repo.not_found`.
 *
 * Permission: `project:manage`.
 */
import { resolveWorkspace } from '~~/server/features/kb/workspace'
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

  await runProjectsServiceCall(() =>
    container.ghSyncService.purgeRepo({
      organisationId: ws.organisationId,
      repoId,
    }),
  )

  return { ok: true }
})
