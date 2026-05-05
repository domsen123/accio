/**
 * GET /api/vault/entries/[id] — fetch a vault entry with decrypted payload
 * (T-V-16, REQ-VAULT-7).
 *
 * Returns the full plaintext payload — the client renders fields behind a
 * "reveal" toggle (REQ-VAULT-12). Each toggle click in the UI emits its
 * own `ui_reveal` access-log event; the GET itself is the entry-fetch
 * baseline. Permission `vault:read`. 423 if locked.
 */
import { resolveWorkspace } from '~~/server/features/kb/workspace'
import { PERMISSIONS } from '~~/server/features/rbac/permissions'
import { requirePermission } from '~~/server/features/rbac/rbac.guard'
import { requireVaultUnlocked } from '~~/server/features/vault/api-utils'
import { container } from '~~/server/utils/container'

export default defineEventHandler(async (event) => {
  const ws = await resolveWorkspace(event)
  await requirePermission(event, {
    permission: PERMISSIONS.VAULT_READ,
    scope: 'organisation',
    getScopeId: () => ws.organisationId,
  })

  const vault = requireVaultUnlocked(event)
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'vault.entry.id_required' })
  }

  const result = await container.vaultService.getEntry({
    id,
    organisationId: ws.organisationId,
    masterKey: vault.session.masterKey,
  })
  if (!result) {
    throw createError({ statusCode: 404, statusMessage: 'vault.entry.not_found' })
  }

  return { entry: result.entry, payload: result.payload }
})
