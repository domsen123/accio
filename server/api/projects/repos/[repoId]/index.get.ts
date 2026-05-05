/**
 * GET /api/projects/repos/[repoId] — single local `gh_repos` row
 * (T-4.6, REQ-PROJ-5). Soft-deleted or cross-org ids return 404
 * `gh.repo.not_found` (no existence leak).
 *
 * Permission: `project:read`.
 */
import { resolveWorkspace } from '~~/server/features/kb/workspace'
import { serialiseRepo } from '~~/server/features/projects/api-schemas'
import {
  getRequiredParam,
  projectsThrow,
  runProjectsServiceCall,
} from '~~/server/features/projects/api-utils'
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

  const repoId = getRequiredParam(event, 'repoId', 'gh.repo.id_required')

  const repo = await runProjectsServiceCall(() =>
    container.ghProjectsReadService.getRepo({
      organisationId: ws.organisationId,
      repoId,
    }),
  )

  if (!repo) {
    projectsThrow(404, 'gh.repo.not_found', { repoId })
    return undefined as never
  }

  return { repo: serialiseRepo(repo) }
})
