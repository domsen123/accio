/**
 * GET /api/kb/categories — flat list of workspace categories (REQ-KB-3).
 *
 * The client builds the tree from `parentId`. Soft-deleted categories are
 * excluded by default; pass `?includeDeleted=1` to include them.
 */
import { resolveWorkspace } from '~~/server/features/kb/workspace'
import { PERMISSIONS } from '~~/server/features/rbac/permissions'
import { requirePermission } from '~~/server/features/rbac/rbac.guard'
import { container } from '~~/server/utils/container'

export default defineEventHandler(async (event) => {
  const ws = await resolveWorkspace(event)

  await requirePermission(event, {
    permission: PERMISSIONS.KB_READ,
    scope: 'organisation',
    getScopeId: () => ws.organisationId,
  })

  const includeDeleted = ['1', 'true', 'yes'].includes(
    String(getQuery(event).includeDeleted ?? '').toLowerCase(),
  )

  const data = await container.kbCategoryService.list({
    organisationId: ws.organisationId,
    includeDeleted,
  })

  return { data }
})
