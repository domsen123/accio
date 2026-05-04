/**
 * DELETE /api/kb/entries/[id]/purge — hard-delete (REQ-KB-9, ADR-009).
 *
 * Only callable from the Trash UI on entries that are already soft-deleted;
 * the service layer enforces that and throws `KbCannotPurgeActiveError`,
 * which we map to 409 `kb.purge.entry_active`. Not in DESIGN-API §KB but the
 * task brief requires the route — flagged as a deviation in tasks.md.
 */
import {
  getRequiredParam,
  runKbServiceCall,
} from '~~/server/features/kb/api-utils'
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

  const id = getRequiredParam(event, 'id', 'kb.entry.id_required')

  const existing = await container.kbEntryService.findById(id)
  if (!existing || existing.organisationId !== ws.organisationId) {
    throw createError({ statusCode: 404, statusMessage: 'kb.entry.not_found' })
  }

  await runKbServiceCall(() => container.kbEntryService.purge({
    id,
    organisationId: ws.organisationId,
  }))

  setResponseStatus(event, 204)
  return null
})
