// MCP write tool: kb_remove_tag.
//
// Refs: DESIGN-TOOLS §Write KB. Class is `auto`.
//
// Resolves the tag by case-insensitive name match within the workspace. If the
// tag doesn't exist, the operation is a no-op and we return the entry's
// current tag list (rather than throwing) — symmetric with `linkTag`'s
// idempotent behaviour. If the entry isn't carrying the tag, `unlinkTag` is
// also a no-op.

import type { KbEntryService, KbTagService } from '../../kb/service'
import type { Tool } from '../mcp-server'
import { z } from 'zod'
import { resolveLiveKbEntry } from './kb-resolve-entry'

const TOOL_NAME = 'kb_remove_tag'

export const kbRemoveTagInputSchema = z.object({
  slug_or_id: z.string().trim().min(1, 'slug_or_id must not be empty'),
  tag: z.string().trim().min(1, 'tag must not be empty'),
})

export type KbRemoveTagInput = z.infer<typeof kbRemoveTagInputSchema>

export interface KbRemoveTagOutput {
  id: string
  slug: string
  tags: string[]
}

export interface CreateKbRemoveTagToolDeps {
  kbEntryService: KbEntryService
  kbTagService: KbTagService
}

export const createKbRemoveTagTool = (
  deps: CreateKbRemoveTagToolDeps,
): Tool<KbRemoveTagInput, KbRemoveTagOutput> => ({
  name: TOOL_NAME,
  description: 'Detach a tag from a KB entry. No-op if the tag is not attached. Does not delete the tag row itself.',
  schema: kbRemoveTagInputSchema as unknown as z.ZodType<KbRemoveTagInput>,
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

    const wanted = input.tag.trim().toLowerCase()
    const tags = await kbTagService.list({ organisationId: ctx.organisationId })
    const match = tags.find(t => t.name.trim().toLowerCase() === wanted)

    if (match)
      await kbEntryService.unlinkTag({ entryId: entry.id, tagId: match.id })

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
