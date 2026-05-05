/**
 * GET /api/vault/trash — list soft-deleted vault entries (T-V-16, REQ-VAULT-8).
 *
 * Returns metadata only. The Trash UI offers restore (write) and purge
 * (delete) actions per row.
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

  requireVaultUnlocked(event)

  const entries = await container.vaultService.listTrash({
    organisationId: ws.organisationId,
  })
  return { data: entries.map(({ payload: _payload, ...metadata }) => metadata) }
})
