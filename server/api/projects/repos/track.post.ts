/**
 * POST /api/projects/repos/track — track a repo by `(owner, name)`.
 *
 * The PATCH route is keyed on the local row UUID, so the picker can't track
 * never-cached rows that way. This route hands off to
 * `ghSyncService.setRepoTracked` which fetches metadata and inserts a stub on
 * first track. Permission: `project:manage`.
 */
import { resolveWorkspace } from '~~/server/features/kb/workspace'
import {
  repoTrackBodySchema,
  serialiseRepo,
} from '~~/server/features/projects/api-schemas'
import {
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

  const input = await readProjectsBody(event, repoTrackBodySchema)

  const { repo } = await runProjectsServiceCall(() =>
    container.ghSyncService.setRepoTracked({
      organisationId: ws.organisationId,
      owner: input.owner,
      name: input.name,
      tracked: input.tracked,
    }),
  )

  return { repo: serialiseRepo(repo) }
})
