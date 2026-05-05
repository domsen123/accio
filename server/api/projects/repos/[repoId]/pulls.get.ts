/**
 * GET /api/projects/repos/[repoId]/pulls — paginated, filterable view of
 * cached PRs (T-4.6, REQ-PROJ-5).
 *
 * Filters mirror the issues route. `state` accepts `merged` in addition to
 * `open`/`closed`/`all` because `gh_pulls.state` flattens GitHub's
 * `closed + merged_at != null` to `merged`. Cross-org / soft-deleted
 * `repoId` returns 404 `gh.repo.not_found`.
 *
 * Permission: `project:read`.
 */
import { resolveWorkspace } from '~~/server/features/kb/workspace'
import {
  pullsListQuerySchema,
  serialisePull,
} from '~~/server/features/projects/api-schemas'
import {
  getRequiredParam,
  projectsThrow,
  readProjectsQuery,
  runProjectsServiceCall,
} from '~~/server/features/projects/api-utils'
import {
  PULLS_LIST_DEFAULT_LIMIT,
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
  const q = readProjectsQuery(event, pullsListQuerySchema)

  const result = await runProjectsServiceCall(() =>
    container.ghProjectsReadService.listPulls({
      organisationId: ws.organisationId,
      repoId,
      filter: {
        state: q.state,
        labels: q.labels,
        q: q.q,
      },
      pagination: { limit: q.limit, offset: q.offset },
      sort: q.sort,
    }),
  )

  if (!result) {
    projectsThrow(404, 'gh.repo.not_found', { repoId })
    return undefined as never
  }

  return {
    rows: result.rows.map(serialisePull),
    total: result.total,
    limit: q.limit ?? PULLS_LIST_DEFAULT_LIMIT,
    offset: q.offset ?? 0,
  }
})
