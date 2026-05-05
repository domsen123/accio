/**
 * GET /api/kb/resolve-slugs — bulk slug existence lookup (T-1.9).
 *
 * The KB Markdown editor's preview pane needs to render `[[slug]]` wikilinks
 * with a visual marker for unresolved targets. Issuing one round-trip per
 * unique slug works but churns the network. This route accepts a comma-
 * separated `slugs` query parameter and returns the subset that resolve to
 * a non-deleted entry inside the active workspace.
 *
 * The endpoint deliberately lives at `/api/kb/resolve-slugs` rather than
 * the more obvious `/api/kb/entries/by-slugs`: the latter would overlap the
 * parametric `/api/kb/entries/:id` route in the typed Nitro route map and
 * narrow the templated `${id}` $fetch calls to the intersection of methods
 * (GET only). Keeping this at the workspace root keeps the route map clean.
 *
 * Response shape:
 *   { resolved: string[] }
 *
 * Permission: `kb:read`. The workspace is resolved the same way as the rest
 * of the KB API (X-Organisation-Id header / earliest-org fallback).
 */
import { z } from 'zod'
import { kbValidate } from '~~/server/features/kb/api-utils'
import { resolveWorkspace } from '~~/server/features/kb/workspace'
import { PERMISSIONS } from '~~/server/features/rbac/permissions'
import { requirePermission } from '~~/server/features/rbac/rbac.guard'
import { container } from '~~/server/utils/container'

const SLUG_MAX = 200
const SLUGS_MAX = 100

const slugSchema = z.string().trim().min(1).max(SLUG_MAX)

const querySchema = z.object({
  slugs: z.preprocess((value) => {
    if (Array.isArray(value))
      return value
    if (typeof value === 'string') {
      return value
        .split(',')
        .map(s => s.trim())
        .filter(Boolean)
    }
    return []
  }, z.array(slugSchema).max(SLUGS_MAX)),
})

export default defineEventHandler(async (event) => {
  const ws = await resolveWorkspace(event)

  await requirePermission(event, {
    permission: PERMISSIONS.KB_READ,
    scope: 'organisation',
    getScopeId: () => ws.organisationId,
  })

  const { slugs } = kbValidate(querySchema, getQuery(event))
  const unique = [...new Set(slugs)]

  if (unique.length === 0)
    return { resolved: [] as string[] }

  const rows = await container.items.kbEntries.findMany({
    filter: {
      organisationId: { _eq: ws.organisationId },
      slug: { _in: unique },
      deletedAt: { _null: true },
    },
    fields: ['slug'],
    limit: unique.length,
  })

  const found = new Set(rows.map(r => r.slug))
  // Preserve the input order so the caller can map back without resorting.
  const resolved = unique.filter(s => found.has(s))

  return { resolved }
})
