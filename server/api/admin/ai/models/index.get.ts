/**
 * GET /api/admin/ai/models — full model registry including disabled rows.
 *
 * (T-3.1e, REQ-AI-3.) Platform-admin only.
 */
import { requireSuperAdmin } from '~~/server/features/rbac/rbac.guard'
import { container } from '~~/server/utils/container'

export default defineEventHandler(async (event) => {
  await requireSuperAdmin(event)

  const models = await container.aiProviderService.listModels({
    includeDisabled: true,
  })

  return { models }
})
