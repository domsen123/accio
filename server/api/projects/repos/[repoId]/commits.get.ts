/**
 * GET /api/projects/repos/[repoId]/commits — paginated view of cached commits
 * (T-4.6, REQ-PROJ-5).
 *
 * Filters: `since` (ISO 8601), `author` (login exact / name+email substring),
 * `limit`/`offset`. Order: `authored_at DESC, id DESC`. Cross-org / soft-
 * deleted `repoId` returns 404 `gh.repo.not_found`.
 *
 * Permission: `project:read`.
 */
import { resolveWorkspace } from '~~/server/features/kb/workspace'
import {
  commitsListQuerySchema,
  serialiseCommit,
} from '~~/server/features/projects/api-schemas'
import {
  getRequiredParam,
  projectsThrow,
  readProjectsQuery,
  runProjectsServiceCall,
} from '~~/server/features/projects/api-utils'
import {
  COMMITS_LIST_DEFAULT_LIMIT,
} from '~~/server/features/projects/read.service'
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
  const q = readProjectsQuery(event, commitsListQuerySchema)

  const result = await runProjectsServiceCall(() =>
    container.ghProjectsReadService.listCommits({
      organisationId: ws.organisationId,
      repoId,
      filter: {
        since: q.since ? new Date(q.since) : undefined,
        author: q.author,
      },
      pagination: { limit: q.limit, offset: q.offset },
    }),
  )

  if (!result) {
    projectsThrow(404, 'gh.repo.not_found', { repoId })
    return undefined as never
  }

  return {
    rows: result.rows.map(serialiseCommit),
    total: result.total,
    limit: q.limit ?? COMMITS_LIST_DEFAULT_LIMIT,
    offset: q.offset ?? 0,
  }
})
