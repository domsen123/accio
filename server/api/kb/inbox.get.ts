/**
 * GET /api/kb/inbox — entries with status `inbox` (REQ-KB-8).
 *
 * Service hydrates category + tags. Pagination via `?limit=&offset=`.
 */
import { readKbQuery } from '~~/server/features/kb/api-utils'
import { paginationQuerySchema } from '~~/server/features/kb/schemas'
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

  const q = readKbQuery(event, paginationQuerySchema)

  const data = await container.kbEntryService.listInbox({
    organisationId: ws.organisationId,
    limit: q.limit,
    offset: q.offset,
  })

  return {
    data,
    limit: q.limit ?? null,
    offset: q.offset ?? 0,
  }
})
