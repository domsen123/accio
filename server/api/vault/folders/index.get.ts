/**
 * GET /api/vault/folders — list all folders for the workspace
 * (T-V-17, REQ-VAULT-9). The client renders these as a tree.
 *
 * The vault must be unlocked even though folders are stored unencrypted —
 * REQ-VAULT-3 gates access to vault routes uniformly to keep the
 * client/server contract simple.
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

  const folders = await container.vaultService.listFolders({
    organisationId: ws.organisationId,
  })
  return { data: folders }
})
