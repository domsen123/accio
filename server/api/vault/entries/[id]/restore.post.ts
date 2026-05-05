/**
 * POST /api/vault/entries/[id]/restore — restore a soft-deleted entry
 * (T-V-16, REQ-VAULT-8). Permission `vault:write` (restoring is a write,
 * not a delete).
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
    permission: PERMISSIONS.VAULT_WRITE,
    scope: 'organisation',
    getScopeId: () => ws.organisationId,
  })

  requireVaultUnlocked(event)
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'vault.entry.id_required' })
  }

  const entry = await container.vaultService.restoreEntry({
    id,
    organisationId: ws.organisationId,
  })

  // No `entry_restore` event in the enum — represented as an `entry_update`
  // because that's what it is at the row level (deleted_at flips back to null).
  await writeVaultAccessLog({
    organisationId: ws.organisationId,
    userId: ws.userId,
    eventType: 'entry_update',
    entryId: entry.id,
  })

  return { entry }
})
