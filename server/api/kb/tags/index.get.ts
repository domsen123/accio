/**
 * GET /api/kb/tags — list all workspace tags (REQ-KB-2).
 *
 * Optional `withUsage=1` decorates each tag with a `usageCount` of live
 * (non-soft-deleted) entries it tags. The unadorned shape is plenty fast
 * for a tag picker; we compute counts only on request to keep the simple
 * case cheap.
 */
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

  const query = getQuery(event)
  const includeDeleted = ['1', 'true', 'yes'].includes(
    String(query.includeDeleted ?? '').toLowerCase(),
  )
  const withUsage = ['1', 'true', 'yes'].includes(
    String(query.withUsage ?? '').toLowerCase(),
  )

  const tags = await container.kbTagService.list({
    organisationId: ws.organisationId,
    includeDeleted,
  })

  if (!withUsage)
    return { data: tags }

  if (tags.length === 0)
    return { data: [] }

  // Junction rows for these tags. We don't currently soft-delete junction
  // rows, so a count of distinct entries gives us the usage figure.
  const junctions = await container.items.kbEntryTags.findMany({
    filter: { tagId: { _in: tags.map(t => t.id) } },
  })
  const counts = new Map<string, number>()
  for (const j of junctions)
    counts.set(j.tagId, (counts.get(j.tagId) ?? 0) + 1)

  const data = tags.map(t => ({ ...t, usageCount: counts.get(t.id) ?? 0 }))
  return { data }
})
