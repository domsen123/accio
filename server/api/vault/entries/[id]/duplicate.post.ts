/**
 * POST /api/vault/entries/[id]/duplicate — clone an entry with " (Copy)"
 * suffix (T-V-16, REQ-VAULT-8). The clone inherits folder, tags, and the
 * full payload (re-encrypted with the same workspace DEK).
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

  const vault = requireVaultUnlocked(event)
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'vault.entry.id_required' })
  }

  const entry = await container.vaultService.duplicateEntry({
    id,
    organisationId: ws.organisationId,
    masterKey: vault.session.masterKey,
    createdBy: ws.userId,
  })

  await writeVaultAccessLog({
    organisationId: ws.organisationId,
    userId: ws.userId,
    eventType: 'entry_create',
    entryId: entry.id,
  })

  setResponseStatus(event, 201)
  return { entry }
})
