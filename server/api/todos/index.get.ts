/**
 * GET /api/todos — list todos with filters (REQ-TODO-1, DESIGN-API §Todos).
 *
 * Filters: completed, priority, tagId, kbEntryId, search, dueBefore, dueAfter,
 * parentTodoId (or `topLevel=1` for `parent_todo_id IS NULL`), includeDeleted,
 * limit, offset, sort.
 *
 * Returns the bare service rows in `{ data, limit, offset }`. Detail hydration
 * (tags, KB links, subtask count) is on the per-id endpoint.
 */
import type { ListTodosInput, TodoSortField } from '~~/server/features/todo/types'
import { resolveWorkspace } from '~~/server/features/kb/workspace'
import { PERMISSIONS } from '~~/server/features/rbac/permissions'
import { requirePermission } from '~~/server/features/rbac/rbac.guard'
import { readTodoQuery } from '~~/server/features/todo/api-utils'
import { listTodosQuerySchema } from '~~/server/features/todo/schemas'
import { container } from '~~/server/utils/container'

export default defineEventHandler(async (event) => {
  const ws = await resolveWorkspace(event)

  await requirePermission(event, {
    permission: PERMISSIONS.TODO_READ,
    scope: 'organisation',
    getScopeId: () => ws.organisationId,
  })

  const q = readTodoQuery(event, listTodosQuerySchema)

  const sort = q.sort
    ? Array.isArray(q.sort)
      ? q.sort
      : q.sort.split(',').map(s => s.trim()).filter(Boolean)
    : undefined

  // `topLevel=true` and `parentTodoId` are mutually exclusive — `parentTodoId`
  // wins if both are provided so an explicit id never silently maps to "any
  // top-level".
  let parentTodoId: ListTodosInput['parentTodoId']
  if (q.parentTodoId !== undefined)
    parentTodoId = q.parentTodoId
  else if (q.topLevel === true)
    parentTodoId = null

  const input: ListTodosInput = {
    organisationId: ws.organisationId,
    completed: q.completed,
    priority: q.priority as ListTodosInput['priority'],
    tagId: q.tagId,
    kbEntryId: q.kbEntryId,
    parentTodoId,
    search: q.search,
    dueBefore: q.dueBefore,
    dueAfter: q.dueAfter,
    includeDeleted: q.includeDeleted,
    limit: q.limit,
    offset: q.offset,
    sort: sort as TodoSortField[] | undefined,
  }

  const data = await container.todoService.list(input)

  return {
    data,
    limit: q.limit ?? null,
    offset: q.offset ?? 0,
  }
})
