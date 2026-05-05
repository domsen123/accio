// MCP read tool: kb_search.
//
// Refs: DESIGN-TOOLS §Read tools, T-3.3, REQ-ORCH-2.
//
// Wraps `kbEntryService.search` (FTS, ranked) and `kbTagService` for tag-name
// → tag-id resolution. Workspace scoping is enforced via `ctx.organisationId`
// — the tool never trusts a caller-supplied org id (no such input exists).

import type { KbCategoryService, KbEntryService, KbTagService } from '../../kb/service'
import type { KbEntryStatus } from '../../kb/types'
import type { Tool } from '../mcp-server'
import { z } from 'zod'
import { KB_ENTRY_STATUSES } from '../../kb/types'

/** Default status filter per DESIGN-TOOLS — exclude inbox/archived noise. */
const DEFAULT_STATUSES: readonly KbEntryStatus[] = ['draft', 'verified'] as const

/** Hard cap from DESIGN-TOOLS — refuse to flood the context window. */
const MAX_LIMIT = 25
const DEFAULT_LIMIT = 10

const statusEnum = z.enum(KB_ENTRY_STATUSES as unknown as [string, ...string[]])

export const kbSearchInputSchema = z.object({
  query: z.string().trim().min(1, 'query must not be empty'),
  tags: z.array(z.string().trim().min(1)).max(20).optional(),
  category_slug: z.string().trim().min(1).optional(),
  status: z.array(statusEnum).max(KB_ENTRY_STATUSES.length).optional(),
  limit: z.number().int().min(1).max(MAX_LIMIT).optional(),
})

export type KbSearchInput = z.infer<typeof kbSearchInputSchema>

export interface KbSearchResultItem {
  id: string
  slug: string
  title: string
  snippet: string
  status: KbEntryStatus
  author_type: 'human' | 'ai'
  author_name: string
  score: number
}

export interface KbSearchOutput {
  results: KbSearchResultItem[]
}

/**
 * Best-effort snippet: trim the body to ~200 chars, single-line. The model can
 * always fetch the full body via `kb_get_entry` if it needs more context, so
 * we deliberately don't run a heavy ts_headline highlight here.
 */
const buildSnippet = (body: string): string => {
  const collapsed = body.replace(/\s+/g, ' ').trim()
  if (collapsed.length <= 200)
    return collapsed
  return `${collapsed.slice(0, 200).trimEnd()}…`
}

export interface CreateKbSearchToolDeps {
  kbEntryService: KbEntryService
  kbCategoryService: KbCategoryService
  kbTagService: KbTagService
}

export const createKbSearchTool = (
  deps: CreateKbSearchToolDeps,
): Tool<KbSearchInput, KbSearchOutput> => ({
  name: 'kb_search',
  description: 'Search KB entries by full-text query, optionally filtered by tags, category slug, and status. Returns ranked entries with id, slug, title, snippet, and metadata.',
  schema: kbSearchInputSchema as unknown as z.ZodType<KbSearchInput>,
  class: 'auto',
  mode: 'read',
  handler: async (input, ctx) => {
    const { kbEntryService, kbCategoryService, kbTagService } = deps
    const limit = input.limit ?? DEFAULT_LIMIT
    const statuses = (input.status ?? DEFAULT_STATUSES) as KbEntryStatus[]

    // Resolve category slug → id; an unknown slug means "no category matches",
    // which deterministically yields zero results.
    let categoryId: string | undefined
    if (input.category_slug) {
      const cat = await kbCategoryService.findOne({
        organisationId: ctx.organisationId,
        slug: input.category_slug,
      })
      if (!cat)
        return { results: [] }
      categoryId = cat.id
    }

    // Resolve tag names → ids. Tag lookup is case-insensitive per ADR-008. We
    // use the same `findOrCreate` the write path uses, but a name that doesn't
    // resolve to any *existing* row would create one — so we list and match
    // case-insensitively here instead.
    let tagIds: string[] | undefined
    if (input.tags && input.tags.length > 0) {
      const tags = await kbTagService.list({ organisationId: ctx.organisationId })
      const wanted = new Set(input.tags.map(t => t.trim().toLowerCase()))
      const matched = tags.filter(t => wanted.has(t.name.trim().toLowerCase()))
      // If any requested tag does not exist, no entry can carry every requested
      // tag — short-circuit to zero results.
      if (matched.length !== wanted.size)
        return { results: [] }
      tagIds = matched.map(t => t.id)
    }

    const rows = await kbEntryService.search({
      organisationId: ctx.organisationId,
      query: input.query,
      status: statuses,
      categoryId,
      tagIds,
      limit,
    })

    return {
      results: rows.map(row => ({
        id: row.id,
        slug: row.slug,
        title: row.title,
        snippet: buildSnippet(row.bodyMd),
        status: row.status as KbEntryStatus,
        author_type: row.authorType as 'human' | 'ai',
        author_name: row.authorName,
        score: row.rank,
      })),
    }
  },
})
