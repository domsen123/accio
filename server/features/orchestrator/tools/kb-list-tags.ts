// MCP read tool: kb_list_tags.
//
// Refs: DESIGN-TOOLS §Read tools, T-3.3.
//
// Lists workspace tags with their KB-entry usage counts, sorted by usage
// (descending) and then name (ascending) so the model gets a stable, useful
// summary. KB tags don't carry a stored slug column (ADR-008) — we derive one
// from the name via the existing slugify helper for output convenience.

import type { KbTagService } from '../../kb/service'
import type { Tool } from '../mcp-server'
import { z } from 'zod'
import { slugify } from '../../kb/slug'

export const kbListTagsInputSchema = z.object({})
export type KbListTagsInput = z.infer<typeof kbListTagsInputSchema>

export interface KbTagSummary {
  id: string
  name: string
  slug: string
  usage_count: number
}

export interface KbListTagsOutput {
  tags: KbTagSummary[]
}

export interface CreateKbListTagsToolDeps {
  kbTagService: KbTagService
}

export const createKbListTagsTool = (
  deps: CreateKbListTagsToolDeps,
): Tool<KbListTagsInput, KbListTagsOutput> => ({
  name: 'kb_list_tags',
  description: 'List all KB tags in the workspace with their usage counts, sorted by usage descending then name ascending.',
  schema: kbListTagsInputSchema as unknown as z.ZodType<KbListTagsInput>,
  class: 'auto',
  mode: 'read',
  handler: async (_input, ctx) => {
    const rows = await deps.kbTagService.listWithUsage({ organisationId: ctx.organisationId })
    const sorted = [...rows].sort((a, b) => {
      if (b.usageCount !== a.usageCount)
        return b.usageCount - a.usageCount
      return a.name.localeCompare(b.name)
    })
    return {
      tags: sorted.map(r => ({
        id: r.id,
        name: r.name,
        slug: slugify(r.name),
        usage_count: r.usageCount,
      })),
    }
  },
})
