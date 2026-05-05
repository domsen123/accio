/**
 * GET /api/kb/entries — list KB entries with filters (REQ-KB-1, REQ-KB-5).
 *
 * Returns hydrated entries (category + tags) shaped to match the detail
 * endpoint, plus pagination envelope `{ data, total, limit, offset }`.
 */
import type { ListKbEntriesInput } from '~~/server/features/kb/types'
import { readKbQuery } from '~~/server/features/kb/api-utils'
import { listKbEntriesQuerySchema } from '~~/server/features/kb/schemas'
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

  const q = readKbQuery(event, listKbEntriesQuerySchema)

  const sort = q.sort
    ? Array.isArray(q.sort)
      ? q.sort
      : q.sort.split(',').map(s => s.trim()).filter(Boolean)
    : undefined

  const input: ListKbEntriesInput = {
    organisationId: ws.organisationId,
    search: q.search,
    status: q.status as ListKbEntriesInput['status'],
    categoryId: q.categoryId,
    includeDescendantCategories: q.includeDescendantCategories,
    tagId: q.tagId,
    authorType: q.authorType as ListKbEntriesInput['authorType'],
    sourceType: q.sourceType as ListKbEntriesInput['sourceType'],
    includeArchived: q.includeArchived,
    includeDeleted: q.includeDeleted,
    limit: q.limit,
    offset: q.offset,
    sort,
  }

  const entries = await container.kbEntryService.list(input)

  // Hydrate via the same shape the detail/inbox/trash endpoints use.
  const ids = entries.map(e => e.id)
  const hydrated = ids.length > 0
    ? await container.items.kbEntries.findMany({
        filter: { id: { _in: ids } },
      })
    : []
  const byId = new Map(hydrated.map(e => [e.id, e]))

  // Reuse the list result for ordering (FTS may have ranked them); attach
  // category/tags by issuing a single junction lookup.
  const entryIds = entries.map(e => e.id)
  const [categoryRows, tagJunctions] = await Promise.all([
    container.items.kbCategories.findMany({
      filter: {
        id: {
          _in: [...new Set(entries.map(e => e.categoryId).filter(Boolean) as string[])],
        },
      },
    }),
    entryIds.length > 0
      ? container.items.kbEntryTags.findMany({
          filter: { entryId: { _in: entryIds } },
        })
      : [],
  ])
  const tagIds = [...new Set(tagJunctions.map(j => j.tagId))]
  const tagRows = tagIds.length > 0
    ? await container.items.kbTags.findMany({ filter: { id: { _in: tagIds } } })
    : []

  const categoriesById = new Map(categoryRows.map(c => [c.id, c]))
  const tagsById = new Map(tagRows.map(t => [t.id, t]))
  const tagsByEntry = new Map<string, typeof tagRows>()
  for (const j of tagJunctions) {
    const arr = tagsByEntry.get(j.entryId) ?? []
    const t = tagsById.get(j.tagId)
    if (t)
      arr.push(t)
    tagsByEntry.set(j.entryId, arr)
  }

  const data = entries.map((entry) => {
    const fresh = byId.get(entry.id) ?? entry
    return {
      ...fresh,
      category: fresh.categoryId ? categoriesById.get(fresh.categoryId) ?? null : null,
      tags: tagsByEntry.get(fresh.id) ?? [],
    }
  })

  return {
    data,
    limit: q.limit ?? null,
    offset: q.offset ?? 0,
  }
})
