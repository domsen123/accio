/**
 * DELETE /api/vault/folders/[id] — delete a folder with the chosen
 * strategy (T-V-17, REQ-VAULT-9). Body: { strategy: "move_to_parent" |
 * "delete_recursive" }.
 *
 * Both strategies are *soft* deletes — hard delete is reserved for the
 * Trash UI's purge action and the vault Reset flow. The strategy decides
 * whether children are re-parented or recursively soft-deleted.
 */
import { resolveWorkspace } from '~~/server/features/kb/workspace'
import { PERMISSIONS } from '~~/server/features/rbac/permissions'
import { requirePermission } from '~~/server/features/rbac/rbac.guard'
import { requireVaultUnlocked } from '~~/server/features/vault/api-utils'
import { deleteFolderBodySchema } from '~~/server/features/vault/schemas'
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
    throw createError({ statusCode: 400, statusMessage: 'vault.folder.id_required' })
  }

  const body = await readValidatedBody(event, b => deleteFolderBodySchema.parse(b))

  await container.vaultService.deleteFolder({
    id,
    organisationId: ws.organisationId,
    strategy: body.strategy,
  })

  return { ok: true }
})
