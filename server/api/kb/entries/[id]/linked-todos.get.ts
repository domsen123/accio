/**
 * GET /api/kb/entries/[id]/linked-todos — list todos that link to this KB
 * entry (REQ-TODO-3, T-2.8).
 *
 * Permission: `kb:read`. The consumer is the KB UI rendering linked todos as
 * an inverse of the Todo→KB display already wired into the todo detail page
 * (T-2.6). Workspace-scoped via `resolveWorkspace`.
 *
 * Query params:
 *   - `includeCompleted` (bool, default false) — when truthy, completed todos
 *     are included. Default excludes them so the KB entry doesn't surface a
 *     wall of done items.
 *
 * Returns `{ data: Array<{ id, title, priority, dueAt, completedAt }> }`. The
 * KB-side display is read-only, so we don't hydrate tags / subtask counts.
 */
import { getRequiredParam, readKbQuery } from '~~/server/features/kb/api-utils'
import { linkedTodosQuerySchema } from '~~/server/features/kb/schemas'
import { resolveWorkspace } from '~~/server/features/kb/workspace'
import { PERMISSIONS } from '~~/server/features/rbac/permissions'
import { requirePermission } from '~~/server/features/rbac/rbac.guard'
import { container } from '~~/server/utils/container'

export default defineEventHandler(async (event) => {
  const ws = await resolveWorkspace(event)

  await requirePermission(event, {
    permission: PERMISSIONS.KB_READ,
    scope: 'organisation',
    getScopeId: () => ws.organisationId,
  })

  const id = getRequiredParam(event, 'id', 'kb.entry.id_required')

  const existing = await container.kbEntryService.findById(id)
  if (!existing || existing.organisationId !== ws.organisationId) {
    throw createError({ statusCode: 404, statusMessage: 'kb.entry.not_found' })
  }

  const q = readKbQuery(event, linkedTodosQuerySchema)

  const data = await container.kbEntryService.getLinkedTodos({
    organisationId: ws.organisationId,
    entryId: id,
    includeCompleted: q.includeCompleted ?? false,
  })

  return { data }
})
