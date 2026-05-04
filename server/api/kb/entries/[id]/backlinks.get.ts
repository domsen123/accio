/**
 * GET /api/kb/entries/[id]/backlinks — list entries that link to this one
 * (REQ-KB-4).
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

  const id = getRequiredParam(event, 'id', 'kb.entry.id_required')

  const existing = await container.kbEntryService.findById(id)
  if (!existing || existing.organisationId !== ws.organisationId) {
    throw createError({ statusCode: 404, statusMessage: 'kb.entry.not_found' })
  }

  const backlinks = await container.kbEntryService.getBacklinks({
    organisationId: ws.organisationId,
    entryId: id,
  })

  return { data: backlinks }
})
