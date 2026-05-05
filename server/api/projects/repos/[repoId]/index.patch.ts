/**
 * PATCH /api/projects/repos/[repoId] — toggle `tracked` (T-4.6, REQ-PROJ-2).
 *
 * v1 body: `{ tracked: boolean }`. We look up the local row to resolve
 * `(owner, name)` (the sync service's `setRepoTracked` is keyed that way so
 * it can insert a stub for never-tracked repos). Cross-org ids return 404
 * `gh.repo.not_found`.
 *
 * Permission: `project:manage`.
 */
import { resolveWorkspace } from '~~/server/features/kb/workspace'
import {
  repoPatchBodySchema,
  serialiseRepo,
} from '~~/server/features/projects/api-schemas'
import {
  getRequiredParam,
  projectsThrow,
  readProjectsBody,
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
  const input = await readProjectsBody(event, repoPatchBodySchema)

  // Resolve the local row first so we can hand `(owner, name)` to
  // setRepoTracked and 404 on cross-org / soft-deleted ids before touching
  // the upstream API.
  const existing = await runProjectsServiceCall(() =>
    container.ghProjectsReadService.getRepo({
      organisationId: ws.organisationId,
      repoId,
    }),
  )
  if (!existing) {
    projectsThrow(404, 'gh.repo.not_found', { repoId })
    return undefined as never
  }

  const { repo } = await runProjectsServiceCall(() =>
    container.ghSyncService.setRepoTracked({
      organisationId: ws.organisationId,
      owner: existing.owner,
      name: existing.name,
      tracked: input.tracked,
    }),
  )

  return { repo: serialiseRepo(repo) }
})
