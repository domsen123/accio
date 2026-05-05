import { resolveWorkspace } from '~~/server/features/kb/workspace'
import { PERMISSIONS } from '~~/server/features/rbac/permissions'
import { requirePermission } from '~~/server/features/rbac/rbac.guard'
/**
 * GET /api/todos/today — active todos due today or overdue (REQ-TODO-4).
 *
 * Sort: due_at ASC, priority DESC (urgent first), created_at ASC. Composes
 * with tag/priority/kb/parent/search filters via the shared view query
 * schema. Date math runs UTC server-side.
 */
import { readTodoQuery } from '~~/server/features/todo/api-utils'
import { todoViewQuerySchema } from '~~/server/features/todo/schemas'
import { container } from '~~/server/utils/container'

export default defineEventHandler(async (event) => {
  const ws = await resolveWorkspace(event)

  await requirePermission(event, {
    permission: PERMISSIONS.TODO_READ,
    scope: 'organisation',
    getScopeId: () => ws.organisationId,
  })

  const q = readTodoQuery(event, todoViewQuerySchema)

  const data = await container.todoService.listToday({
    organisationId: ws.organisationId,
    priority: q.priority as Parameters<typeof container.todoService.listToday>[0]['priority'],
    tagId: q.tagId,
    kbEntryId: q.kbEntryId,
    parentTodoId: q.parentTodoId !== undefined
      ? q.parentTodoId
      : (q.topLevel === true ? null : undefined),
    search: q.search,
    limit: q.limit,
    offset: q.offset,
  })

  return {
    data,
    limit: q.limit ?? null,
    offset: q.offset ?? 0,
  }
})
