/**
 * DELETE /api/vault/entries/[id]/purge — hard-delete a soft-deleted entry
 * (T-V-16, REQ-VAULT-8). The service guards against purging an entry that
 * is still active (`deleted_at IS NULL`).
 */
import { resolveWorkspace } from '~~/server/features/kb/workspace'
import { PERMISSIONS } from '~~/server/features/rbac/permissions'
import { requirePermission } from '~~/server/features/rbac/rbac.guard'
import { requireVaultUnlocked } from '~~/server/features/vault/api-utils'
import { container } from '~~/server/utils/container'

export default defineEventHandler(async (event) => {
  const ws = await resolveWorkspace(event)
  await requirePermission(event, {
    permission: PERMISSIONS.VAULT_DELETE,
    scope: 'organisation',
    getScopeId: () => ws.organisationId,
  })

  requireVaultUnlocked(event)
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'vault.entry.id_required' })
  }

  await container.vaultService.purgeEntry({
    id,
    organisationId: ws.organisationId,
  })

  return { ok: true }
})
