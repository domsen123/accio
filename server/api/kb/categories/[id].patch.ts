/**
 * PATCH /api/kb/categories/[id] — partial update (REQ-KB-3).
 *
 * Slug is intentionally not derived from `name` on update — slugs are stable
 * once minted, just like KB entry slugs.
 */
import {
  getRequiredParam,
  readKbBody,
  runKbServiceCall,
} from '~~/server/features/kb/api-utils'
import { updateKbCategorySchema } from '~~/server/features/kb/schemas'
import { resolveWorkspace } from '~~/server/features/kb/workspace'
import { PERMISSIONS } from '~~/server/features/rbac/permissions'
import { requirePermission } from '~~/server/features/rbac/rbac.guard'
import { container } from '~~/server/utils/container'

export default defineEventHandler(async (event) => {
  const ws = await resolveWorkspace(event)

  await requirePermission(event, {
    permission: PERMISSIONS.KB_WRITE,
    scope: 'organisation',
    getScopeId: () => ws.organisationId,
  })

  const id = getRequiredParam(event, 'id', 'kb.category.id_required')
  const body = await readKbBody(event, updateKbCategorySchema)

  const existing = await container.kbCategoryService.findById(id)
  if (!existing || existing.organisationId !== ws.organisationId) {
    throw createError({ statusCode: 404, statusMessage: 'kb.category.not_found' })
  }

  if (body.parentId) {
    if (body.parentId === id) {
      throw createError({ statusCode: 400, statusMessage: 'kb.category.parent_self' })
    }
    const parent = await container.kbCategoryService.findById(body.parentId)
    if (!parent || parent.organisationId !== ws.organisationId) {
      throw createError({ statusCode: 404, statusMessage: 'kb.category.parent_not_found' })
    }
  }

  const patch: Parameters<typeof container.kbCategoryService.update>[1] = {}
  if (body.name !== undefined)
    patch.name = body.name
  if (body.parentId !== undefined)
    patch.parentId = body.parentId ?? null

  const category = await runKbServiceCall(() => container.kbCategoryService.update(id, patch))
  return { category }
})
