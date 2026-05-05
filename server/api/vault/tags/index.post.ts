/**
 * POST /api/vault/tags — create or look up a tag by name
 * (T-V-17, REQ-VAULT-10).
 *
 * Idempotent on `(organisationId, lower(name))`. The route is convenience
 * for the Tag picker UI; tags also auto-create when an entry is saved with
 * `tagNames` containing a previously-unseen name.
 */
import { resolveWorkspace } from '~~/server/features/kb/workspace'
import { PERMISSIONS } from '~~/server/features/rbac/permissions'
import { requirePermission } from '~~/server/features/rbac/rbac.guard'
import { requireVaultUnlocked } from '~~/server/features/vault/api-utils'
import { createTagBodySchema } from '~~/server/features/vault/schemas'
import { container } from '~~/server/utils/container'

export default defineEventHandler(async (event) => {
  const ws = await resolveWorkspace(event)
  await requirePermission(event, {
    permission: PERMISSIONS.VAULT_WRITE,
    scope: 'organisation',
    getScopeId: () => ws.organisationId,
  })

  requireVaultUnlocked(event)
  const body = await readValidatedBody(event, b => createTagBodySchema.parse(b))

  const tag = await container.vaultService.findOrCreateTag({
    organisationId: ws.organisationId,
    name: body.name,
  })

  return { tag }
})
