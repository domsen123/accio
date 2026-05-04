/**
 * DELETE /api/kb/categories/[id] — soft delete (REQ-KB-3, ADR-009).
 */
import { getRequiredParam } from '~~/server/features/kb/api-utils'
import { resolveWorkspace } from '~~/server/features/kb/workspace'
import { PERMISSIONS } from '~~/server/features/rbac/permissions'
import { requirePermission } from '~~/server/features/rbac/rbac.guard'
import { container } from '~~/server/utils/container'

export default defineEventHandler(async (event) => {
  const ws = await resolveWorkspace(event)

  await requirePermission(event, {
    permission: PERMISSIONS.KB_DELETE,
    scope: 'organisation',
    getScopeId: () => ws.organisationId,
  })

  const id = getRequiredParam(event, 'id', 'kb.category.id_required')

  const existing = await container.kbCategoryService.findById(id)
  if (!existing || existing.organisationId !== ws.organisationId) {
    throw createError({ statusCode: 404, statusMessage: 'kb.category.not_found' })
  }

  const category = await container.kbCategoryService.softDelete(id)
  return { category }
})
