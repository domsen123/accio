/**
 * PATCH /api/vault/folders/[id] — rename and/or move a folder
 * (T-V-17, REQ-VAULT-9).
 *
 * Renames go through `updateFolder` directly. Moves (changing `parentId`)
 * route through `moveFolder` so the cycle + subtree-depth checks fire.
 * Both can be combined in one request: rename runs first, then move.
 */
import { resolveWorkspace } from '~~/server/features/kb/workspace'
import { PERMISSIONS } from '~~/server/features/rbac/permissions'
import { requirePermission } from '~~/server/features/rbac/rbac.guard'
import { requireVaultUnlocked } from '~~/server/features/vault/api-utils'
import { updateFolderBodySchema } from '~~/server/features/vault/schemas'
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
    throw createError({ statusCode: 400, statusMessage: 'vault.folder.id_required' })
  }

  const body = await readValidatedBody(event, b => updateFolderBodySchema.parse(b))

  const existing = await container.vaultService.findFolderById(id)
  if (!existing || existing.organisationId !== ws.organisationId) {
    throw createError({ statusCode: 404, statusMessage: 'vault.folder.not_found' })
  }

  let folder = existing
  if (body.name !== undefined && body.name !== existing.name) {
    folder = await container.vaultService.updateFolder(id, { name: body.name })
  }
  if (body.parentId !== undefined && body.parentId !== existing.parentId) {
    folder = await container.vaultService.moveFolder({
      id,
      organisationId: ws.organisationId,
      parentId: body.parentId,
    })
  }

  return { folder }
})
