import { resolveWorkspace } from '~~/server/features/kb/workspace'
import { PERMISSIONS } from '~~/server/features/rbac/permissions'
import { requirePermission } from '~~/server/features/rbac/rbac.guard'
/**
 * GET /api/todos/open — every active todo regardless of due_at (REQ-TODO-4).
 *
 * Sort: priority DESC (urgent first), due_at ASC NULLS LAST, created_at DESC.
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

  const data = await container.todoService.listOpen({
    organisationId: ws.organisationId,
    priority: q.priority as Parameters<typeof container.todoService.listOpen>[0]['priority'],
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
