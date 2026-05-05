/**
 * GET /api/vault/entries — list vault entries (T-V-16, REQ-VAULT-11).
 *
 * Returns entry metadata only (id, title, folder, timestamps) — never the
 * encrypted payload. Filters: `folderId`, `rootOnly`, `tagId`, `q` (title
 * substring). Permission `vault:read`. Vault must be unlocked: REQ-VAULT-3
 * says the UI requires unlock to display results, even though titles are
 * technically plaintext.
 */
import { resolveWorkspace } from '~~/server/features/kb/workspace'
import { PERMISSIONS } from '~~/server/features/rbac/permissions'
import { requirePermission } from '~~/server/features/rbac/rbac.guard'
import { requireVaultUnlocked } from '~~/server/features/vault/api-utils'
import { listEntriesQuerySchema } from '~~/server/features/vault/schemas'
import { container } from '~~/server/utils/container'

export default defineEventHandler(async (event) => {
  const ws = await resolveWorkspace(event)
  await requirePermission(event, {
    permission: PERMISSIONS.VAULT_READ,
    scope: 'organisation',
    getScopeId: () => ws.organisationId,
  })
  requireVaultUnlocked(event)

  const q = await getValidatedQuery(event, query => listEntriesQuerySchema.parse(query))

  const folderId = q.rootOnly === true
    ? null
    : (q.folderId ?? undefined)

  const entries = await container.vaultService.listEntries({
    organisationId: ws.organisationId,
    folderId,
    tagId: q.tagId,
    query: q.q,
    limit: q.limit,
    offset: q.offset,
  })

  return {
    data: entries.map(({ payload: _payload, ...metadata }) => metadata),
    limit: q.limit ?? null,
    offset: q.offset ?? 0,
  }
})
