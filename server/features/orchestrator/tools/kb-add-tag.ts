// MCP write tool: kb_add_tag.
//
// Refs: DESIGN-TOOLS §Write KB, ADR-008 (tag rows are workspace-scoped, case-
// insensitive). Class is `auto`.
//
// Auto-creates the tag row if missing, mirroring the API route's existing
// behaviour (`kbTagService.findOrCreate`). The link is idempotent — adding an
// already-attached tag is a no-op (`kbEntryService.linkTag` returns the
// existing junction row).

import type { KbEntryService, KbTagService } from '../../kb/service'
import type { Tool } from '../mcp-server'
import { z } from 'zod'
import { resolveLiveKbEntry } from './kb-resolve-entry'

const TOOL_NAME = 'kb_add_tag'

export const kbAddTagInputSchema = z.object({
  slug_or_id: z.string().trim().min(1, 'slug_or_id must not be empty'),
  tag: z.string().trim().min(1, 'tag must not be empty'),
})

export type KbAddTagInput = z.infer<typeof kbAddTagInputSchema>

export interface KbAddTagOutput {
  id: string
  slug: string
  tags: string[]
}

export interface CreateKbAddTagToolDeps {
  kbEntryService: KbEntryService
  kbTagService: KbTagService
}

export const createKbAddTagTool = (
  deps: CreateKbAddTagToolDeps,
): Tool<KbAddTagInput, KbAddTagOutput> => ({
  name: TOOL_NAME,
  description: 'Attach a tag to a KB entry. Auto-creates the tag if it does not exist in the workspace.',
  schema: kbAddTagInputSchema as unknown as z.ZodType<KbAddTagInput>,
  class: 'auto',
  mode: 'write',
  handler: async (input, ctx) => {
    const { kbEntryService, kbTagService } = deps

    const entry = await resolveLiveKbEntry({
      kbEntryService,
      organisationId: ctx.organisationId,
      toolName: TOOL_NAME,
      slugOrId: input.slug_or_id,
    })

    const tag = await kbTagService.findOrCreate({
      organisationId: ctx.organisationId,
      name: input.tag,
    })

    await kbEntryService.linkTag({ entryId: entry.id, tagId: tag.id })

    // Re-read the hydrated entry so the returned `tags` reflects the post-op
    // state — relies on `findBySlug` to return the entry with its tag rows.
    const hydrated = await kbEntryService.findBySlug({
      organisationId: ctx.organisationId,
      slug: entry.slug,
    })

    return {
      id: entry.id,
      slug: entry.slug,
      tags: (hydrated?.tags ?? []).map(t => t.name),
    }
  },
})
