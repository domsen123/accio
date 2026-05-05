import { resolveWorkspace } from '~~/server/features/kb/workspace'
import { PERMISSIONS } from '~~/server/features/rbac/permissions'
import { requirePermission } from '~~/server/features/rbac/rbac.guard'
/**
 * POST /api/todos/[id]/tags — replace the tag set on a todo (DESIGN-API
 * §Todos).
 *
 * Body: `{ tagNames: string[] }`. Idempotent set replacement. Tag rows are
 * auto-created on first use via the shared `kb_tags` table (ADR-008). Mirrors
 * the convention used by `POST /api/kb/entries/[id]/tags`.
 */
import {
  getRequiredParam,
  readTodoBody,
  runTodoServiceCall,
} from '~~/server/features/todo/api-utils'
import { replaceTodoTagsSchema } from '~~/server/features/todo/schemas'
import { container } from '~~/server/utils/container'

export default defineEventHandler(async (event) => {
  const ws = await resolveWorkspace(event)

  await requirePermission(event, {
    permission: PERMISSIONS.TODO_WRITE,
    scope: 'organisation',
    getScopeId: () => ws.organisationId,
  })

  const id = getRequiredParam(event, 'id', 'todo.id_required')
  const body = await readTodoBody(event, replaceTodoTagsSchema)

  const existing = await container.items.todos.readOne(id)
  if (!existing || existing.organisationId !== ws.organisationId) {
    throw createError({ statusCode: 404, statusMessage: 'todo.not_found' })
  }

  // Service `update` handles tag-set replacement when `tagNames` is provided.
  const todo = await runTodoServiceCall(() => container.todoService.update(id, {
    tagNames: body.tagNames,
  }))

  return { todo }
})
