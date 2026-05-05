// MCP read tool: kb_get_entry.
//
// Refs: DESIGN-TOOLS §Read tools, T-3.3.
//
// Resolves either a slug or a ULID id within the caller's workspace. Throws
// `McpToolNotFoundEntityError` (which bubbles unchanged through `invoke`) when
// no live entry matches.

import type { KbEntryService } from '../../kb/service'
import type { KbEntryAuthorType, KbEntrySourceType, KbEntryStatus, KbEntryWithRelations } from '../../kb/types'
import type { Tool } from '../mcp-server'
import { z } from 'zod'
import { McpToolNotFoundEntityError } from '../errors'

const TOOL_NAME = 'kb_get_entry'

export const kbGetEntryInputSchema = z.object({
  slug_or_id: z.string().trim().min(1, 'slug_or_id must not be empty'),
  include_backlinks: z.boolean().optional(),
})

export type KbGetEntryInput = z.infer<typeof kbGetEntryInputSchema>

export interface KbGetEntryBacklink {
  id: string
  slug: string
  title: string
}

export interface KbGetEntryOutput {
  id: string
  slug: string
  title: string
  body_md: string
  status: KbEntryStatus
  author_type: KbEntryAuthorType
  author_name: string
  source_type: KbEntrySourceType
  source_ref: string | null
  category: { id: string, slug: string, name: string } | null
  tags: { id: string, name: string }[]
  created_at: string
  updated_at: string
  backlinks?: KbGetEntryBacklink[]
}

export interface CreateKbGetEntryToolDeps {
  kbEntryService: KbEntryService
}

/**
 * ULID heuristic: 26 chars, Crockford base-32. Cheaper than two DB lookups.
 * If the heuristic mis-classifies a slug that happens to be 26 base-32 chars,
 * the id lookup misses and we fall back to the slug lookup anyway.
 */
const ULID_RE = /^[0-9A-HJKMNP-TV-Z]{26}$/i

const shapeEntry = (
  entry: KbEntryWithRelations,
  backlinks?: KbGetEntryBacklink[],
): KbGetEntryOutput => ({
  id: entry.id,
  slug: entry.slug,
  title: entry.title,
  body_md: entry.bodyMd,
  status: entry.status as KbEntryStatus,
  author_type: entry.authorType as KbEntryAuthorType,
  author_name: entry.authorName,
  source_type: entry.sourceType as KbEntrySourceType,
  source_ref: entry.sourceRef,
  category: entry.category
    ? { id: entry.category.id, slug: entry.category.slug, name: entry.category.name }
    : null,
  tags: entry.tags.map(t => ({ id: t.id, name: t.name })),
  created_at: entry.createdAt.toISOString(),
  updated_at: entry.updatedAt.toISOString(),
  ...(backlinks !== undefined ? { backlinks } : {}),
})

export const createKbGetEntryTool = (
  deps: CreateKbGetEntryToolDeps,
): Tool<KbGetEntryInput, KbGetEntryOutput> => ({
  name: TOOL_NAME,
  description: 'Fetch a single KB entry by slug or id, including its category, tags, body, and (optionally) backlinks from other entries.',
  schema: kbGetEntryInputSchema as unknown as z.ZodType<KbGetEntryInput>,
  class: 'auto',
  mode: 'read',
  handler: async (input, ctx) => {
    const { kbEntryService } = deps

    // Strategy: try id-first if the input looks like a ULID; otherwise treat
    // as a slug. Both paths confirm the workspace match.
    let entry: KbEntryWithRelations | null = null
    if (ULID_RE.test(input.slug_or_id)) {
      const byId = await kbEntryService.findById(input.slug_or_id)
      if (byId && byId.organisationId === ctx.organisationId && byId.deletedAt === null) {
        // Re-fetch with relations via slug; `findById` returns the bare row.
        entry = await kbEntryService.findBySlug({
          organisationId: ctx.organisationId,
          slug: byId.slug,
        })
      }
    }
    if (!entry) {
      entry = await kbEntryService.findBySlug({
        organisationId: ctx.organisationId,
        slug: input.slug_or_id,
      })
    }
    if (!entry)
      throw new McpToolNotFoundEntityError(TOOL_NAME, 'kb_entry', input.slug_or_id)

    let backlinks: KbGetEntryBacklink[] | undefined
    if (input.include_backlinks) {
      backlinks = await kbEntryService.getBacklinks({
        organisationId: ctx.organisationId,
        entryId: entry.id,
      })
    }

    return shapeEntry(entry, backlinks)
  },
})
