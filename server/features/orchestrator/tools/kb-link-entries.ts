// MCP write tool: kb_link_entries.
//
// Refs: DESIGN-TOOLS §Write KB, REQ-KB-4 (wikilinks), DESIGN-WIKILINKS.
// Class is `auto`.
//
// Inserts a `[[to-slug]]` wikilink at the end of `from`'s body (and vice-versa
// when `direction='both'`). The KB entry service's `update` path owns the
// wikilink rebuild — this tool only touches the body markdown and lets the
// service refresh `kb_entry_links` as part of the same transaction.

import type { KbEntryService } from '../../kb/service'
import type { Tool } from '../mcp-server'
import { z } from 'zod'
import { resolveLiveKbEntry } from './kb-resolve-entry'

const TOOL_NAME = 'kb_link_entries'

const DIRECTIONS = ['one_way', 'both'] as const
type Direction = (typeof DIRECTIONS)[number]

export const kbLinkEntriesInputSchema = z.object({
  from_slug_or_id: z.string().trim().min(1, 'from_slug_or_id must not be empty'),
  to_slug_or_id: z.string().trim().min(1, 'to_slug_or_id must not be empty'),
  direction: z.enum(DIRECTIONS as unknown as [string, ...string[]]),
})

export type KbLinkEntriesInput = z.infer<typeof kbLinkEntriesInputSchema>

export interface KbLinkEntriesOutput {
  from: { id: string, slug: string }
  to: { id: string, slug: string }
  direction: Direction
}

export interface CreateKbLinkEntriesToolDeps {
  kbEntryService: KbEntryService
}

/**
 * Append `[[targetSlug]]` to `body` only if it isn't already present (idempotent).
 * The body's existing trailing whitespace is preserved aside from a single
 * inserted blank line above the new link, which keeps the markdown rendering
 * sensible for typical paragraph-terminated bodies.
 */
const appendWikilink = (body: string, targetSlug: string): string => {
  const link = `[[${targetSlug}]]`
  if (body.includes(link))
    return body
  if (body.length === 0)
    return link
  // Trim trailing newlines so we can re-insert a deterministic separator.
  const trimmed = body.replace(/\s+$/, '')
  return `${trimmed}\n\n${link}`
}

export const createKbLinkEntriesTool = (
  deps: CreateKbLinkEntriesToolDeps,
): Tool<KbLinkEntriesInput, KbLinkEntriesOutput> => ({
  name: TOOL_NAME,
  description: 'Link two KB entries by inserting a wikilink. one_way inserts in the source body only; both inserts in both bodies.',
  schema: kbLinkEntriesInputSchema as unknown as z.ZodType<KbLinkEntriesInput>,
  class: 'auto',
  mode: 'write',
  handler: async (input, ctx) => {
    const { kbEntryService } = deps

    const fromEntry = await resolveLiveKbEntry({
      kbEntryService,
      organisationId: ctx.organisationId,
      toolName: TOOL_NAME,
      slugOrId: input.from_slug_or_id,
    })
    const toEntry = await resolveLiveKbEntry({
      kbEntryService,
      organisationId: ctx.organisationId,
      toolName: TOOL_NAME,
      slugOrId: input.to_slug_or_id,
    })

    // Update `from` body — service rebuilds wikilink rows transactionally.
    const newFromBody = appendWikilink(fromEntry.bodyMd, toEntry.slug)
    if (newFromBody !== fromEntry.bodyMd)
      await kbEntryService.update(fromEntry.id, { body: newFromBody })

    if (input.direction === 'both') {
      const newToBody = appendWikilink(toEntry.bodyMd, fromEntry.slug)
      if (newToBody !== toEntry.bodyMd)
        await kbEntryService.update(toEntry.id, { body: newToBody })
    }

    return {
      from: { id: fromEntry.id, slug: fromEntry.slug },
      to: { id: toEntry.id, slug: toEntry.slug },
      direction: input.direction as Direction,
    }
  },
})
