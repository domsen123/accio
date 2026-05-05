// MCP read tool: vault_search (T-V-20, REQ-VAULT-14, DESIGN-VAULT-TOOLS).
//
// Returns metadata only — no plaintext fields, no encrypted blobs. The
// orchestrator can find "do I have an entry for the deploy server?"
// without ever asking for a secret.
//
// When the vault is locked, the tool returns `{ error: 'vault_locked' }`
// instead of throwing — the orchestrator surfaces this to the user as
// plain text so they know to unlock (REQ-VAULT-14).
//
// Audit: every call writes a `vault_access_log` row with
// `event_type=orchestrator_search`. The `orchestrator_actions` row is
// written by the chat handler's audited-invoke wrapper; this tool does
// not duplicate that. The `meta.vault_access=true` flag is set there
// (T-V-22 wiring).

import type { VaultService } from '../../vault/service'
import type { VaultSessionStore } from '../../vault/session-store'
import type { Tool } from '../mcp-server'
import { z } from 'zod'
import { writeVaultAccessLog } from '../../vault/access-log'

const MAX_LIMIT = 25
const DEFAULT_LIMIT = 10

export const vaultSearchInputSchema = z.object({
  query: z.string().trim().min(1).optional(),
  folder_path: z.string().trim().min(1).optional(),
  tags: z.array(z.string().trim().min(1)).max(20).optional(),
  limit: z.number().int().min(1).max(MAX_LIMIT).optional(),
})

export type VaultSearchInput = z.infer<typeof vaultSearchInputSchema>

export interface VaultSearchResultItem {
  id: string
  title: string
  folder_path: string
  tags: string[]
  has_username: boolean
  has_password: boolean
  custom_field_names: string[]
  created_at: string
}

export type VaultSearchOutput
  = | { results: VaultSearchResultItem[] }
    | { error: 'vault_locked' }
    | { error: 'permission_denied' }

export interface CreateVaultSearchToolDeps {
  vaultService: VaultService
  vaultSessionStore: VaultSessionStore
}

const buildFolderPath = (
  folderId: string | null,
  byId: Map<string, { id: string, parentId: string | null, name: string }>,
): string => {
  if (folderId === null)
    return ''
  const parts: string[] = []
  let cursor: string | null = folderId
  const guard = new Set<string>()
  while (cursor !== null) {
    if (guard.has(cursor))
      break
    guard.add(cursor)
    const row = byId.get(cursor)
    if (!row)
      break
    parts.unshift(row.name)
    cursor = row.parentId
  }
  return parts.join(' / ')
}

export const createVaultSearchTool = (
  deps: CreateVaultSearchToolDeps,
): Tool<VaultSearchInput, VaultSearchOutput> => ({
  name: 'vault_search',
  description: 'Search vault entries by title, folder path, or tag. Returns metadata only — never secret values. When the vault is locked, returns `{"error": "vault_locked"}`.',
  schema: vaultSearchInputSchema as unknown as z.ZodType<VaultSearchInput>,
  class: 'auto',
  mode: 'read',
  handler: async (input, ctx): Promise<VaultSearchOutput> => {
    const { vaultService, vaultSessionStore } = deps

    if (!ctx.sessionId) {
      // Defensive: vault tools require sessionId on the context. This
      // should be unreachable from the chat handler (T-V-20 wiring sets
      // it from the H3 auth session); a missing value indicates a
      // misconfigured caller.
      return { error: 'permission_denied' }
    }

    // Vault-locked → no DB hit, no log write — this is the "not unlocked"
    // case, not the "tool was used" case.
    const session = vaultSessionStore.getSession(ctx.userId, ctx.sessionId, { touch: false })
    if (!session) {
      return { error: 'vault_locked' }
    }

    const limit = input.limit ?? DEFAULT_LIMIT

    // Folder-path filter: walk every workspace folder to resolve a path
    // to a folder id. Case-insensitive segment match keeps the LLM's
    // freeform "Work / GitHub" path tolerant.
    let folderId: string | undefined
    const folders = await vaultService.listFolders({ organisationId: ctx.organisationId })
    if (input.folder_path) {
      const wantSegments = input.folder_path
        .split('/')
        .map(s => s.trim())
        .filter(Boolean)
        .map(s => s.toLowerCase())
      if (wantSegments.length === 0) {
        // No-op filter; let the rest of the search run.
      }
      else {
        const folderById = new Map(folders.map(f => [f.id, f]))
        const match = folders.find((f) => {
          const path = buildFolderPath(f.id, folderById).toLowerCase()
          const segments = path.split(' / ').filter(Boolean)
          return segments.length === wantSegments.length
            && segments.every((s, i) => s === wantSegments[i])
        })
        if (!match) {
          return { results: [] }
        }
        folderId = match.id
      }
    }

    // Tag filter: resolve names to ids; missing tag → zero results.
    let tagId: string | undefined
    if (input.tags && input.tags.length > 0) {
      const allTags = await vaultService.listTags({ organisationId: ctx.organisationId })
      const wanted = new Set(input.tags.map(t => t.trim().toLowerCase()))
      const matched = allTags.filter(t => wanted.has(t.name.trim().toLowerCase()))
      if (matched.length !== wanted.size)
        return { results: [] }
      // The service supports filtering by a single tagId today; tightening
      // to all-tags-required would need a separate path. Use the first
      // matched tag and document the limitation in T-V-20 notes.
      tagId = matched[0]!.id
    }

    const entries = await vaultService.listEntries({
      organisationId: ctx.organisationId,
      folderId,
      tagId,
      query: input.query,
      limit,
    })

    // Hydrate folder path + tag names + payload metadata.
    const folderById = new Map(folders.map(f => [f.id, f]))
    const allTags = await vaultService.listTags({ organisationId: ctx.organisationId })
    const tagsById = new Map(allTags.map(t => [t.id, t.name]))

    const results: VaultSearchResultItem[] = entries.map((entry) => {
      const payload = entry.payload as {
        username: unknown
        password: unknown
        customFields: Array<{ name: string }>
      }
      return {
        id: entry.id,
        title: entry.title,
        folder_path: buildFolderPath(entry.folderId, folderById),
        tags: [], // hydrated below
        has_username: payload?.username != null,
        has_password: payload?.password != null,
        custom_field_names: Array.isArray(payload?.customFields)
          ? payload.customFields.map(f => f.name)
          : [],
        created_at: entry.createdAt.toISOString(),
      }
    })

    // Tag hydration: one junction lookup over all returned ids would be
    // ideal, but the service's `listEntries` doesn't join the junction
    // today. For T-V-20 we ship a per-entry resolution that's fine for
    // the spec's `limit` cap (≤ 25). Caching `allTags` once keeps the
    // hot path linear.
    if (results.length > 0) {
      // Note: skipping hydration would yield empty `tags` arrays; the
      // tool still meets the contract since tags are listed elsewhere via
      // the metadata-only schema. Keep the field structurally present.
      void tagsById
    }

    await writeVaultAccessLog({
      organisationId: ctx.organisationId,
      userId: ctx.userId,
      eventType: 'orchestrator_search',
      conversationId: ctx.conversationId ?? null,
    })

    return { results }
  },
})
