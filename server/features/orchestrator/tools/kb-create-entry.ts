// MCP write tool: kb_create_entry.
//
// Refs: DESIGN-TOOLS §Write KB, REQ-ORCH-7 (author propagation), REQ-ORCH-8
// (no hard delete from orchestrator), ADR-007 (AI defaults to inbox).
//
// `class` is dynamic: `auto` when `status='inbox'` (or omitted, since the
// default is `inbox`), `confirm` for `draft` or `verified`. T-3.6's wrapper
// resolves this via `classifyTool(tool, input)`.

import type { KbCategoryService, KbEntryService } from '../../kb/service'
import type { KbEntrySourceType, KbEntryStatus } from '../../kb/types'
import type { Tool, ToolClass } from '../mcp-server'
import { z } from 'zod'
import { McpToolNotFoundEntityError } from '../errors'

const TOOL_NAME = 'kb_create_entry'

/** AI-creatable statuses — `archived` is intentionally not exposed here. */
const CREATE_STATUSES = ['inbox', 'draft', 'verified'] as const
type CreateStatus = (typeof CREATE_STATUSES)[number]

const SOURCE_TYPES = ['manual', 'commit', 'claude_code_session', 'chat', 'external'] as const

export const kbCreateEntryInputSchema = z.object({
  title: z.string().trim().min(1, 'title must not be empty'),
  body_md: z.string().min(1, 'body_md must not be empty'),
  status: z.enum(CREATE_STATUSES as unknown as [string, ...string[]]).optional(),
  category_slug: z.string().trim().min(1).optional(),
  tags: z.array(z.string().trim().min(1)).max(20).optional(),
  source_type: z.enum(SOURCE_TYPES as unknown as [string, ...string[]]).optional(),
  source_ref: z.string().trim().min(1).optional(),
})

export type KbCreateEntryInput = z.infer<typeof kbCreateEntryInputSchema>

export interface KbCreateEntryOutput {
  id: string
  slug: string
  title: string
  status: KbEntryStatus
}

export interface CreateKbCreateEntryToolDeps {
  kbEntryService: KbEntryService
  kbCategoryService: KbCategoryService
}

const DEFAULT_AUTHOR_NAME = 'AI'

/**
 * Static classifier reused by the dynamic `class` field. Kept as a named
 * function so T-3.6 / tests can call it without re-deriving the rule.
 */
export const classifyKbCreateEntry = (input: KbCreateEntryInput): ToolClass =>
  (input.status ?? 'inbox') === 'inbox' ? 'auto' : 'confirm'

export const createKbCreateEntryTool = (
  deps: CreateKbCreateEntryToolDeps,
): Tool<KbCreateEntryInput, KbCreateEntryOutput> => ({
  name: TOOL_NAME,
  description: 'Create a new KB entry. Defaults to inbox status (auto-execute); draft or verified requires confirmation.',
  schema: kbCreateEntryInputSchema as unknown as z.ZodType<KbCreateEntryInput>,
  class: classifyKbCreateEntry,
  mode: 'write',
  handler: async (input, ctx) => {
    const { kbEntryService, kbCategoryService } = deps

    let categoryId: string | null = null
    if (input.category_slug) {
      const cat = await kbCategoryService.findOne({
        organisationId: ctx.organisationId,
        slug: input.category_slug,
      })
      if (!cat)
        throw new McpToolNotFoundEntityError(TOOL_NAME, 'kb_category', input.category_slug)
      categoryId = cat.id
    }

    const status = (input.status ?? 'inbox') as CreateStatus

    const entry = await kbEntryService.create({
      organisationId: ctx.organisationId,
      title: input.title,
      body: input.body_md,
      categoryId,
      tagNames: input.tags,
      status,
      authorType: 'ai',
      authorName: ctx.authorName ?? DEFAULT_AUTHOR_NAME,
      sourceType: (input.source_type ?? 'chat') as KbEntrySourceType,
      sourceRef: input.source_ref ?? ctx.conversationId ?? null,
      createdBy: ctx.userId,
    })

    if (!entry)
      throw new Error('kb_create_entry: service returned no entry')

    return {
      id: entry.id,
      slug: entry.slug,
      title: entry.title,
      status: entry.status as KbEntryStatus,
    }
  },
})
