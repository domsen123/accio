/**
 * DELETE /api/kb/tags/[id] — soft delete a tag (REQ-KB-2).
 *
 * The schema's `kbEntryTags.tagId` FK uses `ON DELETE CASCADE`, but we
 * soft-delete here (per ADR-009 default). Junction rows stay intact so a
 * later restore preserves entry-tag membership.
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

  const id = getRequiredParam(event, 'id', 'kb.tag.id_required')

  const existing = await container.kbTagService.findById(id)
  if (!existing || existing.organisationId !== ws.organisationId) {
    throw createError({ statusCode: 404, statusMessage: 'kb.tag.not_found' })
  }

  const tag = await container.kbTagService.softDelete(id)
  return { tag }
})
