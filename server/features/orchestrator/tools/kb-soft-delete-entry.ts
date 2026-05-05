// MCP write tool: kb_soft_delete_entry.
//
// Refs: DESIGN-TOOLS §Write KB, REQ-ORCH-8 (no hard delete from orchestrator),
// REQ-KB-9 / ADR-009 (only the Trash UI can hard-delete). Class is `confirm`.
//
// Sets `deleted_at`. The orchestrator MUST never call `kbEntryService.purge` —
// that path is gated by the Trash UI and the runtime "must already be soft-
// deleted" guard. This tool only touches the soft-delete path.

import type { KbEntryService } from '../../kb/service'
import type { Tool } from '../mcp-server'
import { z } from 'zod'
import { resolveLiveKbEntry } from './kb-resolve-entry'

const TOOL_NAME = 'kb_soft_delete_entry'

export const kbSoftDeleteEntryInputSchema = z.object({
  slug_or_id: z.string().trim().min(1, 'slug_or_id must not be empty'),
})

export type KbSoftDeleteEntryInput = z.infer<typeof kbSoftDeleteEntryInputSchema>

export interface KbSoftDeleteEntryOutput {
  id: string
  slug: string
  deleted_at: string
}

export interface CreateKbSoftDeleteEntryToolDeps {
  kbEntryService: KbEntryService
}

export const createKbSoftDeleteEntryTool = (
  deps: CreateKbSoftDeleteEntryToolDeps,
): Tool<KbSoftDeleteEntryInput, KbSoftDeleteEntryOutput> => ({
  name: TOOL_NAME,
  description: 'Move a KB entry to the trash by setting deleted_at. Hard-delete is not exposed to the orchestrator. Requires user confirmation.',
  schema: kbSoftDeleteEntryInputSchema as unknown as z.ZodType<KbSoftDeleteEntryInput>,
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

    const updated = await kbEntryService.softDelete(entry.id)
    const deletedAt = updated.deletedAt ?? new Date()

    return {
      id: updated.id,
      slug: updated.slug,
      deleted_at: deletedAt.toISOString(),
    }
  },
})
