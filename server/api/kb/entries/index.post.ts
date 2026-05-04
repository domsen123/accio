/**
 * POST /api/kb/entries — create a KB entry (REQ-KB-1, REQ-KB-2, REQ-KB-6).
 *
 * Defaults `authorType=human`, `authorName=<user.name|email>` and
 * `sourceType=manual` so a vanilla call from the UI Just Works.
 */
import { readKbBody, runKbServiceCall } from '~~/server/features/kb/api-utils'
import { createKbEntrySchema } from '~~/server/features/kb/schemas'
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

  const body = await readKbBody(event, createKbEntrySchema)
  const user = event.context.user!
  const authorName = body.authorName ?? user.name ?? user.email ?? ''

  const entry = await runKbServiceCall(() => container.kbEntryService.create({
    organisationId: ws.organisationId,
    title: body.title,
    body: body.body,
    categoryId: body.categoryId ?? null,
    tagNames: body.tagNames,
    status: body.status as Parameters<typeof container.kbEntryService.create>[0]['status'],
    authorType: body.authorType as Parameters<typeof container.kbEntryService.create>[0]['authorType'],
    authorName,
    sourceType: body.sourceType as Parameters<typeof container.kbEntryService.create>[0]['sourceType'],
    sourceRef: body.sourceRef ?? null,
    createdBy: user.id,
  }))

  setResponseStatus(event, 201)
  return { entry }
})
