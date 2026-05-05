import { resolveWorkspace } from '~~/server/features/kb/workspace'
import { PERMISSIONS } from '~~/server/features/rbac/permissions'
import { requirePermission } from '~~/server/features/rbac/rbac.guard'
/**
 * POST /api/todos/[id]/uncomplete — clear `completed_at` (DESIGN-API §Todos).
 *
 * Idempotent inverse of `complete`. Permission: `todo:write`.
 */
import { getRequiredParam, runTodoServiceCall } from '~~/server/features/todo/api-utils'
import { container } from '~~/server/utils/container'

export default defineEventHandler(async (event) => {
  const ws = await resolveWorkspace(event)

  await requirePermission(event, {
    permission: PERMISSIONS.TODO_WRITE,
    scope: 'organisation',
    getScopeId: () => ws.organisationId,
  })

  const id = getRequiredParam(event, 'id', 'todo.id_required')

  const existing = await container.items.todos.readOne(id)
  if (!existing || existing.organisationId !== ws.organisationId) {
    throw createError({ statusCode: 404, statusMessage: 'todo.not_found' })
  }

  const todo = await runTodoServiceCall(() => container.todoService.uncomplete(id))
  return { todo }
})
