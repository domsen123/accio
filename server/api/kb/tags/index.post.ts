/**
 * POST /api/kb/tags — explicit tag creation (REQ-KB-2).
 *
 * Most tag creation flows through the entry create path's `tagNames`. This
 * route exists so a picker UI can pre-create a tag without touching an
 * entry. Idempotent on case-insensitive name match.
 */
import { readKbBody } from '~~/server/features/kb/api-utils'
import { createKbTagSchema } from '~~/server/features/kb/schemas'
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

  const body = await readKbBody(event, createKbTagSchema)

  const tag = await container.kbTagService.findOrCreate({
    organisationId: ws.organisationId,
    name: body.name,
  })

  setResponseStatus(event, 201)
  return { tag }
})
