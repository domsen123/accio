// Shared helper: resolve a `slug_or_id` input to a live KB entry within the
// caller's workspace. Used by every KB write tool (T-3.4) so the slug/id +
// workspace + soft-delete checks live in one place.

import type { KbEntry } from '../../../database/schema'
import type { KbEntryService } from '../../kb/service'
import { McpToolNotFoundEntityError } from '../errors'

/**
 * ULID heuristic shared with `kb_get_entry`: 26 chars, Crockford base-32.
 * Cheap pre-check before hitting the DB.
 */
const ULID_RE = /^[0-9A-HJKMNP-TV-Z]{26}$/i

/**
 * Resolve a `slug_or_id` input to a live (non-soft-deleted) KB entry in the
 * caller's workspace. Returns the bare row (no relations) — callers that need
 * the hydrated shape should re-fetch via `findBySlug` afterwards.
 *
 * Throws `McpToolNotFoundEntityError` (which bubbles unchanged through
 * `invoke`) on miss, including cross-workspace slugs/ids.
 */
export const resolveLiveKbEntry = async (params: {
  kbEntryService: KbEntryService
  organisationId: string
  toolName: string
  slugOrId: string
}): Promise<KbEntry> => {
  const { kbEntryService, organisationId, toolName, slugOrId } = params

  if (ULID_RE.test(slugOrId)) {
    const byId = await kbEntryService.findById(slugOrId)
    if (byId && byId.organisationId === organisationId && byId.deletedAt === null)
      return byId
  }

  const bySlug = await kbEntryService.findBySlug({ organisationId, slug: slugOrId })
  if (bySlug)
    return bySlug as KbEntry

  throw new McpToolNotFoundEntityError(toolName, 'kb_entry', slugOrId)
}
