/**
 * POST /api/kb/categories — create a category (REQ-KB-3).
 *
 * Slug is derived from the name via {@link slugify}; collisions get a
 * `-2`/`-3` suffix matching the entry slug convention so we don't surprise
 * users with cross-feature slug rules.
 */
import { readKbBody, runKbServiceCall } from '~~/server/features/kb/api-utils'
import { createKbCategorySchema } from '~~/server/features/kb/schemas'
import { slugify } from '~~/server/features/kb/slug'
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

  const body = await readKbBody(event, createKbCategorySchema)

  // Slug uniqueness within workspace: pick a free `slug` / `slug-N`. The
  // category service exposes no resolveUniqueSlug so we run a small loop.
  const base = slugify(body.name)
  let slug = base
  for (let n = 2; n < 50; n++) {
    const existing = await container.kbCategoryService.findOne({
      organisationId: ws.organisationId,
      slug,
    })
    if (!existing)
      break
    slug = `${base}-${n}`
  }

  if (body.parentId) {
    const parent = await container.kbCategoryService.findById(body.parentId)
    if (!parent || parent.organisationId !== ws.organisationId) {
      throw createError({ statusCode: 404, statusMessage: 'kb.category.parent_not_found' })
    }
  }

  const category = await runKbServiceCall(() => container.kbCategoryService.create({
    organisationId: ws.organisationId,
    name: body.name,
    slug,
    parentId: body.parentId ?? null,
  }))

  setResponseStatus(event, 201)
  return { category }
})
