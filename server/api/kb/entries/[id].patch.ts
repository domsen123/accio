/**
 * PATCH /api/kb/entries/[id] — partial update (REQ-KB-1, REQ-KB-2, REQ-KB-7).
 *
 * The service handles status-transition validation, tag rewrite, wikilink
 * rebuild, and slug stability across edits.
 */
import {
  getRequiredParam,
  readKbBody,
  runKbServiceCall,
} from '~~/server/features/kb/api-utils'
import { updateKbEntrySchema } from '~~/server/features/kb/schemas'
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
  const body = await readKbBody(event, updateKbEntrySchema)

  const existing = await container.kbEntryService.findById(id)
  if (!existing || existing.organisationId !== ws.organisationId) {
    throw createError({ statusCode: 404, statusMessage: 'kb.entry.not_found' })
  }

  const entry = await runKbServiceCall(() => container.kbEntryService.update(id, {
    title: body.title,
    body: body.body,
    categoryId: body.categoryId,
    tagNames: body.tagNames,
    status: body.status as Parameters<typeof container.kbEntryService.update>[1]['status'],
    authorType: body.authorType as Parameters<typeof container.kbEntryService.update>[1]['authorType'],
    authorName: body.authorName,
    sourceType: body.sourceType as Parameters<typeof container.kbEntryService.update>[1]['sourceType'],
    sourceRef: body.sourceRef,
  }))

  return { entry }
})
