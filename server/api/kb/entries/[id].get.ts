/**
 * GET /api/kb/entries/[id] — fetch a single KB entry by id (DESIGN-API §KB).
 *
 * The `[id]` value also accepts a slug (transparent fallback). Soft-deleted
 * entries are surfaced when `?includeDeleted=1` is set so the Trash UI can
 * fetch a deleted record.
 */
import { getRequiredParam } from '~~/server/features/kb/api-utils'
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

  const idOrSlug = getRequiredParam(event, 'id', 'kb.entry.id_required')
  const includeDeleted = ['1', 'true', 'yes'].includes(
    String(getQuery(event).includeDeleted ?? '').toLowerCase(),
  )

  // Try id first.
  let entry = await container.kbEntryService.findById(idOrSlug)
  if (entry && entry.organisationId !== ws.organisationId)
    entry = null
  if (entry && !includeDeleted && entry.deletedAt !== null)
    entry = null

  if (!entry) {
    const bySlug = await container.kbEntryService.findBySlug({
      organisationId: ws.organisationId,
      slug: idOrSlug,
      includeDeleted,
    })
    if (!bySlug) {
      throw createError({ statusCode: 404, statusMessage: 'kb.entry.not_found' })
    }
    return { entry: bySlug }
  }

  // Hydrate with category + tags using the slug-based path for shape parity.
  const hydrated = await container.kbEntryService.findBySlug({
    organisationId: ws.organisationId,
    slug: entry.slug,
    includeDeleted,
  })

  if (!hydrated) {
    throw createError({ statusCode: 404, statusMessage: 'kb.entry.not_found' })
  }

  return { entry: hydrated }
})
