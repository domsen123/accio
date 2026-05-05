/**
 * GET /api/projects/repos — list repos (T-4.6, REQ-PROJ-2, REQ-PROJ-5).
 *
 * Two modes via `?source`:
 *   - `cache` (default): paginated local rows (`gh_repos`) for the workspace
 *     repo list view. Filters: `tracked` (bool), `q` (LIKE on full_name /
 *     description), `includeDeleted` (bool, default false). Returns
 *     `{ rows, total, limit, offset }`.
 *   - `github`: live "accessible repos" feed joined against the local cache
 *     for the picker UI (T-4.8). Returns `{ repos }`. Hits GitHub via the
 *     connected PAT — fails with 409 `gh.client.not_connected` if no
 *     connection is configured.
 *
 * Permission: `project:read`.
 */
import { resolveWorkspace } from '~~/server/features/kb/workspace'
import {
  reposListQuerySchema,
  serialiseAccessibleRepo,
  serialiseRepo,
} from '~~/server/features/projects/api-schemas'
import {
  readProjectsQuery,
  runProjectsServiceCall,
} from '~~/server/features/projects/api-utils'
import {
  REPOS_LIST_DEFAULT_LIMIT,
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

  const q = readProjectsQuery(event, reposListQuerySchema)
  const source = q.source ?? 'cache'

  if (source === 'github') {
    const result = await runProjectsServiceCall(() =>
      container.ghSyncService.listAccessibleRepos({ organisationId: ws.organisationId }),
    )
    return { repos: result.repos.map(serialiseAccessibleRepo) }
  }

  const result = await runProjectsServiceCall(() =>
    container.ghProjectsReadService.listRepos({
      organisationId: ws.organisationId,
      filter: {
        tracked: q.tracked,
        q: q.q,
        includeDeleted: q.includeDeleted,
      },
      pagination: {
        limit: q.limit,
        offset: q.offset,
      },
    }),
  )

  return {
    rows: result.rows.map(serialiseRepo),
    total: result.total,
    limit: q.limit ?? REPOS_LIST_DEFAULT_LIMIT,
    offset: q.offset ?? 0,
  }
})
