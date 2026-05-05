import { resolveWorkspace } from '~~/server/features/kb/workspace'
import { PERMISSIONS } from '~~/server/features/rbac/permissions'
import { requirePermission } from '~~/server/features/rbac/rbac.guard'
/**
 * PATCH /api/todos/[id] — partial update (DESIGN-API §Todos).
 *
 * The service handles depth re-validation when `parentTodoId` changes, tag
 * rewrite when `tagNames` is supplied, and KB-link rewrite when `kbEntryIds`
 * is supplied. Cross-workspace lookups are blocked at the resolver step.
 */
import {
  getRequiredParam,
  readTodoBody,
  runTodoServiceCall,
} from '~~/server/features/todo/api-utils'
import { updateTodoSchema } from '~~/server/features/todo/schemas'
import { container } from '~~/server/utils/container'

export default defineEventHandler(async (event) => {
  const ws = await resolveWorkspace(event)

  await requirePermission(event, {
    permission: PERMISSIONS.TODO_WRITE,
    scope: 'organisation',
    getScopeId: () => ws.organisationId,
  })

  const id = getRequiredParam(event, 'id', 'todo.id_required')
  const body = await readTodoBody(event, updateTodoSchema)

  const existing = await container.items.todos.readOne(id)
  if (!existing || existing.organisationId !== ws.organisationId) {
    throw createError({ statusCode: 404, statusMessage: 'todo.not_found' })
  }

  const todo = await runTodoServiceCall(() => container.todoService.update(id, {
    title: body.title,
    description: body.description,
    priority: body.priority as Parameters<typeof container.todoService.update>[1]['priority'],
    dueAt: body.dueAt,
    parentTodoId: body.parentTodoId,
    tagNames: body.tagNames,
    kbEntryIds: body.kbEntryIds,
  }))

  return { todo }
})
