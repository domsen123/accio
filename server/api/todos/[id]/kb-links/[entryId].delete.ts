import { resolveWorkspace } from '~~/server/features/kb/workspace'
import { PERMISSIONS } from '~~/server/features/rbac/permissions'
import { requirePermission } from '~~/server/features/rbac/rbac.guard'
/**
 * DELETE /api/todos/[id]/kb-links/[entryId] — unlink a KB entry from a todo.
 *
 * Idempotent — unlinking a non-linked entry is a no-op (returns 204).
 * Permission: `todo:write`. Symmetric with `POST /api/todos/[id]/kb-links`.
 *
 * Not in DESIGN-API §Todos verbatim — that section only mentions a
 * replace-style POST. Added here so the link surface is fully addressable
 * granularly, matching the link surface offered by the service.
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
  const entryId = getRequiredParam(event, 'entryId', 'todo.kb_link.entry_id_required')

  const existing = await container.items.todos.readOne(todoId)
  if (!existing || existing.organisationId !== ws.organisationId) {
    throw createError({ statusCode: 404, statusMessage: 'todo.not_found' })
  }

  await container.todoService.unlinkKb({ todoId, entryId })

  setResponseStatus(event, 204)
  return null
})
