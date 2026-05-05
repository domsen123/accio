import { resolveWorkspace } from '~~/server/features/kb/workspace'
import { PERMISSIONS } from '~~/server/features/rbac/permissions'
import { requirePermission } from '~~/server/features/rbac/rbac.guard'
/**
 * GET /api/todos/upcoming — active todos due in the next `withinDays` days
 * (default 7), exclusive of today/overdue (REQ-TODO-4).
 *
 * Sort: due_at ASC, priority DESC (urgent first), created_at ASC.
 */
import { readTodoQuery } from '~~/server/features/todo/api-utils'
import { upcomingTodoQuerySchema } from '~~/server/features/todo/schemas'
import { container } from '~~/server/utils/container'

export default defineEventHandler(async (event) => {
  const ws = await resolveWorkspace(event)

  await requirePermission(event, {
    permission: PERMISSIONS.TODO_READ,
    scope: 'organisation',
    getScopeId: () => ws.organisationId,
  })

  const q = readTodoQuery(event, upcomingTodoQuerySchema)

  const data = await container.todoService.listUpcoming({
    organisationId: ws.organisationId,
    priority: q.priority as Parameters<typeof container.todoService.listUpcoming>[0]['priority'],
    tagId: q.tagId,
    kbEntryId: q.kbEntryId,
    parentTodoId: q.parentTodoId !== undefined
      ? q.parentTodoId
      : (q.topLevel === true ? null : undefined),
    search: q.search,
    withinDays: q.withinDays,
    limit: q.limit,
    offset: q.offset,
  })

  return {
    data,
    withinDays: q.withinDays ?? 7,
    limit: q.limit ?? null,
    offset: q.offset ?? 0,
  }
})
