import { resolveWorkspace } from '~~/server/features/kb/workspace'
import { PERMISSIONS } from '~~/server/features/rbac/permissions'
import { requirePermission } from '~~/server/features/rbac/rbac.guard'
/**
 * DELETE /api/todos/[id]/tags/[tagId] — unlink a single tag from a todo.
 *
 * Idempotent — unlinking a tag that isn't attached is a no-op (returns 204).
 * Permission: `todo:write`.
 *
 * Not in DESIGN-API §Todos verbatim — that section only mentions a
 * replace-style POST. Added here so the tag surface is fully addressable
 * granularly. Full set replacement is `POST /api/todos/[id]/tags`.
 */
import { getRequiredParam } from '~~/server/features/todo/api-utils'
import { container } from '~~/server/utils/container'

export default defineEventHandler(async (event) => {
  const ws = await resolveWorkspace(event)

  await requirePermission(event, {
    permission: PERMISSIONS.TODO_WRITE,
    scope: 'organisation',
    getScopeId: () => ws.organisationId,
  })

  const todoId = getRequiredParam(event, 'id', 'todo.id_required')
  const tagId = getRequiredParam(event, 'tagId', 'todo.tag.id_required')

  const existing = await container.items.todos.readOne(todoId)
  if (!existing || existing.organisationId !== ws.organisationId) {
    throw createError({ statusCode: 404, statusMessage: 'todo.not_found' })
  }

  await container.todoService.unlinkTag({ todoId, tagId })

  setResponseStatus(event, 204)
  return null
})
