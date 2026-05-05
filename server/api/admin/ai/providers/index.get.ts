/**
 * GET /api/admin/ai/providers — list every provider, including disabled.
 *
 * Platform-admin only (ADR-015). Used by the model registry admin UI to
 * group models under their providers and let admins toggle a provider on/off.
 */
import { requireSuperAdmin } from '~~/server/features/rbac/rbac.guard'
import { container } from '~~/server/utils/container'

export default defineEventHandler(async (event) => {
  await requireSuperAdmin(event)

  const providers = await container.aiProviderService.listProviders({
    includeDisabled: true,
  })

  return { providers }
})
