/**
 * GET /api/todos/counts — aggregate counts for the four canonical views, used
 * by the side-nav / tab badges (REQ-TODO-4).
 *
 * Returns `{ today, upcoming, open, completed }` numbers. No filters — this
 * is the badge endpoint, so it always reflects the unfiltered workspace
 * view counts.
 */
import { resolveWorkspace } from '~~/server/features/kb/workspace'
import { PERMISSIONS } from '~~/server/features/rbac/permissions'
import { requirePermission } from '~~/server/features/rbac/rbac.guard'
import { container } from '~~/server/utils/container'

export default defineEventHandler(async (event) => {
  const ws = await resolveWorkspace(event)

  await requirePermission(event, {
    permission: PERMISSIONS.TODO_READ,
    scope: 'organisation',
    getScopeId: () => ws.organisationId,
  })

  const counts = await container.todoService.getViewCounts({
    organisationId: ws.organisationId,
  })

  return { counts }
})
