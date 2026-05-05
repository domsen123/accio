/**
 * POST /api/vault/entries — create a vault entry (T-V-16, REQ-VAULT-7).
 *
 * Requires the vault to be unlocked for the current session (HTTP 423
 * otherwise). Permission `vault:write`. Title and folder are stored
 * unencrypted; everything in `payload` (username, password, url, notes,
 * secret custom fields) is encrypted server-side under the workspace DEK
 * before persistence.
 */
import { resolveWorkspace } from '~~/server/features/kb/workspace'
import { PERMISSIONS } from '~~/server/features/rbac/permissions'
import { requirePermission } from '~~/server/features/rbac/rbac.guard'
import { writeVaultAccessLog } from '~~/server/features/vault/access-log'
import { requireVaultUnlocked } from '~~/server/features/vault/api-utils'
import { createEntryBodySchema } from '~~/server/features/vault/schemas'
import { container } from '~~/server/utils/container'

export default defineEventHandler(async (event) => {
  const ws = await resolveWorkspace(event)
  await requirePermission(event, {
    permission: PERMISSIONS.VAULT_WRITE,
    scope: 'organisation',
    getScopeId: () => ws.organisationId,
  })

  const vault = requireVaultUnlocked(event)
  const body = await readValidatedBody(event, b => createEntryBodySchema.parse(b))

  const entry = await container.vaultService.createEntry({
    organisationId: ws.organisationId,
    masterKey: vault.session.masterKey,
    title: body.title,
    folderId: body.folderId ?? null,
    payload: body.payload,
    tagNames: body.tagNames,
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
