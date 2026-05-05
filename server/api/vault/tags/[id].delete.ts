/**
 * DELETE /api/vault/tags/[id] — remove a tag and cascade the junction
 * (T-V-17, REQ-VAULT-10).
 *
 * Hard delete here is intentional — vault tags don't have soft-delete
 * semantics. The `vault_entry_tags` junction cascades on the schema's
 * `ON DELETE CASCADE`.
 */
import { resolveWorkspace } from '~~/server/features/kb/workspace'
import { PERMISSIONS } from '~~/server/features/rbac/permissions'
import { requirePermission } from '~~/server/features/rbac/rbac.guard'
import { requireVaultUnlocked } from '~~/server/features/vault/api-utils'
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
    throw createError({ statusCode: 400, statusMessage: 'vault.tag.id_required' })
  }

  // Workspace-scope check before hitting the service.
  const tags = await container.vaultService.listTags({
    organisationId: ws.organisationId,
  })
  if (!tags.some(t => t.id === id)) {
    throw createError({ statusCode: 404, statusMessage: 'vault.tag.not_found' })
  }

  await container.vaultService.removeTag(id)
  return { ok: true }
})
