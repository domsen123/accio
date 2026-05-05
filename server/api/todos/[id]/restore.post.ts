import { resolveWorkspace } from '~~/server/features/kb/workspace'
import { PERMISSIONS } from '~~/server/features/rbac/permissions'
import { requirePermission } from '~~/server/features/rbac/rbac.guard'
/**
 * POST /api/todos/[id]/restore — un-soft-delete a todo (ADR-009).
 *
 * Permission is `todo:write` rather than `todo:delete` — restoring is the
 * inverse of a delete and shouldn't itself require destructive rights. Not
 * listed verbatim in DESIGN-API §Todos, but symmetric with the KB surface
 * (T-1.7) and required for the Trash UI in T-2.5.
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

  const todo = await runTodoServiceCall(() => container.todoService.restore(id))
  return { todo }
})
