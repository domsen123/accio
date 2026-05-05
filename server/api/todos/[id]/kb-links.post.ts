/**
 * POST /api/todos/[id]/kb-links — link a KB entry to this todo (DESIGN-API
 * §Todos).
 *
 * Body: `{ entryId }`. Idempotent — re-linking an already-linked entry is a
 * no-op. The KB entry must exist in the same workspace.
 *
 * Deviation from the literal DESIGN-API wording ("Replace KB link set"):
 * this endpoint does single-link add to match the more granular link/unlink
 * surface the service exposes. Full set replacement is available via
 * `PATCH /api/todos/[id]` with `{ kbEntryIds: [...] }`.
 */
import { resolveWorkspace } from '~~/server/features/kb/workspace'
import { PERMISSIONS } from '~~/server/features/rbac/permissions'
import { requirePermission } from '~~/server/features/rbac/rbac.guard'
import {
  getRequiredParam,
  readTodoBody,
  runTodoServiceCall,
} from '~~/server/features/todo/api-utils'
import { addTodoKbLinkSchema } from '~~/server/features/todo/schemas'
import { TodoKbLinkNotFoundError } from '~~/server/features/todo/types'
import { container } from '~~/server/utils/container'

export default defineEventHandler(async (event) => {
  const ws = await resolveWorkspace(event)

  await requirePermission(event, {
    permission: PERMISSIONS.TODO_WRITE,
    scope: 'organisation',
    getScopeId: () => ws.organisationId,
  })

  const todoId = getRequiredParam(event, 'id', 'todo.id_required')
  const body = await readTodoBody(event, addTodoKbLinkSchema)

  const existing = await container.items.todos.readOne(todoId)
  if (!existing || existing.organisationId !== ws.organisationId) {
    throw createError({ statusCode: 404, statusMessage: 'todo.not_found' })
  }

  // Verify the KB entry is in the same workspace before linking. The error
  // path here mirrors what the service throws for the array-rebuild flow on
  // PATCH (`TodoKbLinkNotFoundError`); we route through `runTodoServiceCall`
  // so the same code (`todo.kb_link.not_found` → 404) is returned.
  const link = await runTodoServiceCall(async () => {
    const entry = await container.items.kbEntries.readOne(body.entryId)
    if (!entry || entry.organisationId !== ws.organisationId)
      throw new TodoKbLinkNotFoundError(body.entryId)
    return container.todoService.linkKb({
      todoId,
      entryId: body.entryId,
    })
  })

  setResponseStatus(event, 201)
  return { link }
})
