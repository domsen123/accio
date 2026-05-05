import { resolveWorkspace } from '~~/server/features/kb/workspace'
import { PERMISSIONS } from '~~/server/features/rbac/permissions'
import { requirePermission } from '~~/server/features/rbac/rbac.guard'
/**
 * DELETE /api/todos/[id]/purge — hard-delete a soft-deleted todo (ADR-009).
 *
 * Service throws `TodoCannotPurgeActiveError` for live rows; we map that to
 * 409 `todo.purge.active`. Cascades clear todo_tags / todo_kb_links / subtask
 * rows via the schema's ON DELETE CASCADE.
 *
 * Not listed verbatim in DESIGN-API §Todos, but symmetric with the KB surface
 * (T-1.7) and required for the Trash UI in T-2.5.
 */
import {
  getRequiredParam,
  runTodoServiceCall,
} from '~~/server/features/todo/api-utils'
import { container } from '~~/server/utils/container'

export default defineEventHandler(async (event) => {
  const ws = await resolveWorkspace(event)

  await requirePermission(event, {
    permission: PERMISSIONS.TODO_DELETE,
    scope: 'organisation',
    getScopeId: () => ws.organisationId,
  })

  const id = getRequiredParam(event, 'id', 'todo.id_required')

  const existing = await container.items.todos.readOne(id)
  if (!existing || existing.organisationId !== ws.organisationId) {
    throw createError({ statusCode: 404, statusMessage: 'todo.not_found' })
  }

  await runTodoServiceCall(() => container.todoService.purge({
    id,
    organisationId: ws.organisationId,
  }))

  setResponseStatus(event, 204)
  return null
})
