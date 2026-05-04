/**
 * POST /api/kb/entries/[id]/tags — replace the tag set on an entry
 * (DESIGN-API §KB, REQ-KB-2).
 *
 * Idempotent set replacement. Tag rows are auto-created on first use via
 * the service's `findOrCreate` path.
 */
import {
  getRequiredParam,
  readKbBody,
  runKbServiceCall,
} from '~~/server/features/kb/api-utils'
import { replaceTagsSchema } from '~~/server/features/kb/schemas'
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
  const body = await readKbBody(event, replaceTagsSchema)

  const existing = await container.kbEntryService.findById(id)
  if (!existing || existing.organisationId !== ws.organisationId) {
    throw createError({ statusCode: 404, statusMessage: 'kb.entry.not_found' })
  }

  // Service `update` handles tag set replacement when `tagNames` is provided.
  const entry = await runKbServiceCall(() => container.kbEntryService.update(id, {
    tagNames: body.tagNames,
  }))

  return { entry }
})
