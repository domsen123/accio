// MCP write tool: kb_set_status.
//
// Refs: DESIGN-TOOLS §Write KB, REQ-KB-7 (status transitions).
//
// Class is `confirm`. Delegates to `kbEntryService.setStatus`, which enforces
// `isValidStatusTransition`. Invalid transitions surface as
// `KbInvalidStatusTransitionError` from the service — the registry wraps them
// in `McpToolExecutionError` with the original on `.cause`, so the chat
// handler / UI can introspect.

import type { KbEntryService } from '../../kb/service'
import type { KbEntryStatus } from '../../kb/types'
import type { Tool } from '../mcp-server'
import { z } from 'zod'
import { KB_ENTRY_STATUSES } from '../../kb/types'
import { resolveLiveKbEntry } from './kb-resolve-entry'

const TOOL_NAME = 'kb_set_status'

const statusEnum = z.enum(KB_ENTRY_STATUSES as unknown as [string, ...string[]])

export const kbSetStatusInputSchema = z.object({
  slug_or_id: z.string().trim().min(1, 'slug_or_id must not be empty'),
  status: statusEnum,
})

export type KbSetStatusInput = z.infer<typeof kbSetStatusInputSchema>

export interface KbSetStatusOutput {
  id: string
  slug: string
  status: KbEntryStatus
}

export interface CreateKbSetStatusToolDeps {
  kbEntryService: KbEntryService
}

export const createKbSetStatusTool = (
  deps: CreateKbSetStatusToolDeps,
): Tool<KbSetStatusInput, KbSetStatusOutput> => ({
  name: TOOL_NAME,
  description: 'Move a KB entry to a different status (inbox, draft, verified, archived). Requires user confirmation.',
  schema: kbSetStatusInputSchema as unknown as z.ZodType<KbSetStatusInput>,
  class: 'confirm',
  mode: 'write',
  handler: async (input, ctx) => {
    const { kbEntryService } = deps

    const entry = await resolveLiveKbEntry({
      kbEntryService,
      organisationId: ctx.organisationId,
      toolName: TOOL_NAME,
      slugOrId: input.slug_or_id,
    })

    const updated = await kbEntryService.setStatus(entry.id, input.status as KbEntryStatus)

    return {
      id: updated.id,
      slug: updated.slug,
      status: updated.status as KbEntryStatus,
    }
  },
})
