/**
 * POST /api/vault/folders — create a folder (T-V-17, REQ-VAULT-9).
 *
 * The service enforces the depth cap (≤ 5). Returns 400 if the parent is
 * already at max depth.
 */
import { resolveWorkspace } from '~~/server/features/kb/workspace'
import { PERMISSIONS } from '~~/server/features/rbac/permissions'
import { requirePermission } from '~~/server/features/rbac/rbac.guard'
import { requireVaultUnlocked } from '~~/server/features/vault/api-utils'
import { createFolderBodySchema } from '~~/server/features/vault/schemas'
import { container } from '~~/server/utils/container'

export default defineEventHandler(async (event) => {
  const ws = await resolveWorkspace(event)
  await requirePermission(event, {
    permission: PERMISSIONS.VAULT_WRITE,
    scope: 'organisation',
    getScopeId: () => ws.organisationId,
  })

  requireVaultUnlocked(event)
  const body = await readValidatedBody(event, b => createFolderBodySchema.parse(b))

  const folder = await container.vaultService.createFolder({
    organisationId: ws.organisationId,
    name: body.name,
    parentId: body.parentId ?? null,
  })

  setResponseStatus(event, 201)
  return { folder }
})
