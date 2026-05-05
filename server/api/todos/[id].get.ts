import { resolveWorkspace } from '~~/server/features/kb/workspace'
import { PERMISSIONS } from '~~/server/features/rbac/permissions'
import { requirePermission } from '~~/server/features/rbac/rbac.guard'
/**
 * GET /api/todos/[id] — single todo, hydrated with tags, KB links, and
 * immediate subtask count (DESIGN-API §Todos).
 *
 * Soft-deleted rows surface only when `?includeDeleted=1` is set so the Trash
 * UI can fetch a deleted record.
 */
import { getRequiredParam } from '~~/server/features/todo/api-utils'
import { container } from '~~/server/utils/container'

export default defineEventHandler(async (event) => {
  const ws = await resolveWorkspace(event)

  await requirePermission(event, {
    permission: PERMISSIONS.TODO_READ,
    scope: 'organisation',
    getScopeId: () => ws.organisationId,
  })

  const id = getRequiredParam(event, 'id', 'todo.id_required')
  const includeDeleted = ['1', 'true', 'yes'].includes(
    String(getQuery(event).includeDeleted ?? '').toLowerCase(),
  )

  const todo = await container.todoService.findById({
    organisationId: ws.organisationId,
    id,
    includeDeleted,
  })

  if (!todo)
    throw createError({ statusCode: 404, statusMessage: 'todo.not_found' })

  return { todo }
})
