/**
 * DELETE /api/vault/entries/[id] — soft-delete a vault entry
 * (T-V-16, REQ-VAULT-8). Hard delete is the separate /purge route.
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

  await container.vaultService.softDeleteEntry({
    id,
    organisationId: ws.organisationId,
  })

  await writeVaultAccessLog({
    organisationId: ws.organisationId,
    userId: ws.userId,
    eventType: 'entry_delete',
    entryId: id,
  })

  return { ok: true }
})
