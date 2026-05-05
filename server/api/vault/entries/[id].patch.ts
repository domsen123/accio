/**
 * PATCH /api/vault/entries/[id] — update a vault entry (T-V-16, REQ-VAULT-8).
 *
 * Partial update: any of `title`, `folderId`, `payload`, `tagNames` may be
 * supplied. If `payload` is present it's re-encrypted under the workspace
 * DEK in full (no per-field merge — partial-payload updates would require
 * a decrypt + re-encrypt round-trip which we deliberately push to the
 * client to keep the server's plaintext window minimal).
 */
import { resolveWorkspace } from '~~/server/features/kb/workspace'
import { PERMISSIONS } from '~~/server/features/rbac/permissions'
import { requirePermission } from '~~/server/features/rbac/rbac.guard'
import { requireVaultUnlocked } from '~~/server/features/vault/api-utils'
import { updateEntryBodySchema } from '~~/server/features/vault/schemas'
import { container } from '~~/server/utils/container'

export default defineEventHandler(async (event) => {
  const ws = await resolveWorkspace(event)
  await requirePermission(event, {
    permission: PERMISSIONS.VAULT_WRITE,
    scope: 'organisation',
    getScopeId: () => ws.organisationId,
  })

  const vault = requireVaultUnlocked(event)
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'vault.entry.id_required' })
  }

  const body = await readValidatedBody(event, b => updateEntryBodySchema.parse(b))

  const entry = await container.vaultService.updateEntry({
    id,
    organisationId: ws.organisationId,
    masterKey: vault.session.masterKey,
    patch: body,
  })

  return { entry }
})
