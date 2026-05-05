/**
 * DELETE /api/vault/entries/[id]/purge — hard-delete a soft-deleted entry
 * (T-V-16, REQ-VAULT-8). The service guards against purging an entry that
 * is still active (`deleted_at IS NULL`).
 */
import { resolveWorkspace } from '~~/server/features/kb/workspace'
import { PERMISSIONS } from '~~/server/features/rbac/permissions'
import { requirePermission } from '~~/server/features/rbac/rbac.guard'
import { writeVaultAccessLog } from '~~/server/features/vault/access-log'
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

  // Log BEFORE the hard delete: the access-log row's `entry_id` FK has
  // ON DELETE SET NULL so historical queries still surface "entry deleted
  // at <ts>" with the entry's id retained on the row up until the FK is
  // resolved. Logging first preserves the linkage briefly inside the same
  // request; afterwards the FK silently nulls and the field name carries
  // the historical reference.
  await writeVaultAccessLog({
    organisationId: ws.organisationId,
    userId: ws.userId,
    eventType: 'entry_delete',
    entryId: id,
  })

  await container.vaultService.purgeEntry({
    id,
    organisationId: ws.organisationId,
  })

  return { ok: true }
})
