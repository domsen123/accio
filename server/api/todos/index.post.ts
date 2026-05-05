import { resolveWorkspace } from '~~/server/features/kb/workspace'
import { PERMISSIONS } from '~~/server/features/rbac/permissions'
import { requirePermission } from '~~/server/features/rbac/rbac.guard'
/**
 * POST /api/todos — create a todo (DESIGN-API §Todos, REQ-TODO-1..3).
 *
 * Body: `{ title, description?, priority?, dueAt?, parentTodoId?, tagNames?,
 * kbEntryIds? }`. Workspace context resolved via the standard header / query
 * fallback. `createdBy` is set to the requesting user.
 */
import { readTodoBody, runTodoServiceCall } from '~~/server/features/todo/api-utils'
import { createTodoSchema } from '~~/server/features/todo/schemas'
import { container } from '~~/server/utils/container'

export default defineEventHandler(async (event) => {
  const ws = await resolveWorkspace(event)

  await requirePermission(event, {
    permission: PERMISSIONS.TODO_WRITE,
    scope: 'organisation',
    getScopeId: () => ws.organisationId,
  })

  const body = await readTodoBody(event, createTodoSchema)
  const user = event.context.user!

  const todo = await runTodoServiceCall(() => container.todoService.create({
    organisationId: ws.organisationId,
    title: body.title,
    description: body.description ?? null,
    priority: body.priority as Parameters<typeof container.todoService.create>[0]['priority'],
    dueAt: body.dueAt ?? null,
    parentTodoId: body.parentTodoId ?? null,
    tagNames: body.tagNames,
    kbEntryIds: body.kbEntryIds,
    createdBy: user.id,
  }))

  setResponseStatus(event, 201)
  return { todo }
})
