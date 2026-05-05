/**
 * POST /api/vault/entries/[id]/reveal — log a UI-side field reveal
 * (T-V-26, REQ-VAULT-19).
 *
 * The actual decrypted payload was already fetched via GET
 * /api/vault/entries/[id]. This endpoint exists *only* so the audit
 * log records every click of a "reveal" toggle in the UI; we never
 * include the value in the request to avoid round-tripping plaintext.
 */
import { z } from 'zod'
import { resolveWorkspace } from '~~/server/features/kb/workspace'
import { PERMISSIONS } from '~~/server/features/rbac/permissions'
import { requirePermission } from '~~/server/features/rbac/rbac.guard'
import { writeVaultAccessLog } from '~~/server/features/vault/access-log'
import { requireVaultUnlocked } from '~~/server/features/vault/api-utils'
import { container } from '~~/server/utils/container'

const FIELD_REGEX = /^(?:username|password|notes|custom:[\w\- ]{1,80})$/

const schema = z.object({
  field: z.string().regex(FIELD_REGEX),
})

export default defineEventHandler(async (event) => {
  const ws = await resolveWorkspace(event)
  await requirePermission(event, {
    permission: PERMISSIONS.VAULT_READ,
    scope: 'organisation',
    getScopeId: () => ws.organisationId,
  })

  requireVaultUnlocked(event)

  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'vault.entry.id_required' })
  }
  const body = await readValidatedBody(event, b => schema.parse(b))

  const entry = await container.items.vaultEntries.findOne({ id, organisationId: ws.organisationId })
  if (!entry) {
    throw createError({ statusCode: 404, statusMessage: 'vault.entry.not_found' })
  }

  await writeVaultAccessLog({
    organisationId: ws.organisationId,
    userId: ws.userId,
    eventType: 'ui_reveal',
    entryId: id,
    fieldName: body.field,
  })

  return { ok: true }
})
