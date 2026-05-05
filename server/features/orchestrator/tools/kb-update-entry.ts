// MCP write tool: kb_update_entry.
//
// Refs: DESIGN-TOOLS §Write KB, REQ-ORCH-8 (no hard delete from orchestrator).
//
// Class is `confirm`. The handler delegates to `kbEntryService.update`, which
// owns slug stability (REQ-KB-1), tag rewrite, and wikilink rebuild. The tool
// only resolves the slug/id and the optional `category_slug` filter to ids.

import type { KbCategoryService, KbEntryService } from '../../kb/service'
import type { KbEntryStatus } from '../../kb/types'
import type { Tool } from '../mcp-server'
import { z } from 'zod'
import { McpToolNotFoundEntityError } from '../errors'
import { resolveLiveKbEntry } from './kb-resolve-entry'

const TOOL_NAME = 'kb_update_entry'

export const kbUpdateEntryInputSchema = z.object({
  slug_or_id: z.string().trim().min(1, 'slug_or_id must not be empty'),
  title: z.string().trim().min(1).optional(),
  body_md: z.string().min(1).optional(),
  category_slug: z.string().trim().min(1).nullable().optional(),
}).refine(
  v => v.title !== undefined || v.body_md !== undefined || v.category_slug !== undefined,
  { message: 'At least one of title, body_md, category_slug must be supplied' },
)

export type KbUpdateEntryInput = z.infer<typeof kbUpdateEntryInputSchema>

export interface KbUpdateEntryOutput {
  id: string
  slug: string
  title: string
  status: KbEntryStatus
}

export interface CreateKbUpdateEntryToolDeps {
  kbEntryService: KbEntryService
  kbCategoryService: KbCategoryService
}

export const createKbUpdateEntryTool = (
  deps: CreateKbUpdateEntryToolDeps,
): Tool<KbUpdateEntryInput, KbUpdateEntryOutput> => ({
  name: TOOL_NAME,
  description: 'Update a KB entry\'s title, body, or category. Requires user confirmation.',
  schema: kbUpdateEntryInputSchema as unknown as z.ZodType<KbUpdateEntryInput>,
  class: 'confirm',
  mode: 'write',
  handler: async (input, ctx) => {
    const { kbEntryService, kbCategoryService } = deps

    const entry = await resolveLiveKbEntry({
      kbEntryService,
      organisationId: ctx.organisationId,
      toolName: TOOL_NAME,
      slugOrId: input.slug_or_id,
    })

    let categoryId: string | null | undefined
    if (input.category_slug === null) {
      categoryId = null
    }
    else if (input.category_slug !== undefined) {
      const cat = await kbCategoryService.findOne({
        organisationId: ctx.organisationId,
        slug: input.category_slug,
      })
      if (!cat)
        throw new McpToolNotFoundEntityError(TOOL_NAME, 'kb_category', input.category_slug)
      categoryId = cat.id
    }

    const updated = await kbEntryService.update(entry.id, {
      title: input.title,
      body: input.body_md,
      categoryId,
    })

    return {
      id: updated.id,
      slug: updated.slug,
      title: updated.title,
      status: updated.status as KbEntryStatus,
    }
  },
})
