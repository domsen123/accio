/**
 * POST /api/kb/entries/[id]/status — set entry status (REQ-KB-7).
 *
 * Service throws `KbInvalidStatusTransitionError` for unknown enum values;
 * the api-utils mapper translates that to 409 `kb.status.invalid_transition`.
 * Not explicit in DESIGN-API §KB but the task brief requires it — flagged as
 * a deviation in tasks.md.
 */
import {
  getRequiredParam,
  readKbBody,
  runKbServiceCall,
} from '~~/server/features/kb/api-utils'
import { setStatusSchema } from '~~/server/features/kb/schemas'
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

  const id = getRequiredParam(event, 'id', 'kb.entry.id_required')
  const body = await readKbBody(event, setStatusSchema)

  const existing = await container.kbEntryService.findById(id)
  if (!existing || existing.organisationId !== ws.organisationId) {
    throw createError({ statusCode: 404, statusMessage: 'kb.entry.not_found' })
  }

  const entry = await runKbServiceCall(() =>
    container.kbEntryService.setStatus(id, body.status as Parameters<typeof container.kbEntryService.setStatus>[1]),
  )
  return { entry }
})
