/**
 * DELETE /api/admin/ai/models/[id] — hard-delete a model row.
 *
 * (T-3.1e, REQ-AI-3.) Platform-admin only.
 *
 * Note: deletion fails at the DB layer if `orchestrator_actions` rows still
 * reference this model — that's by design (REQ-AI-3 says disable, don't
 * delete, when audit history exists). The FK violation surfaces as a 500;
 * once T-3.7 lands, we'll detect this case explicitly here.
 */
import { getRequiredParam, runAiServiceCall } from '~~/server/features/ai/api-utils'
import { requireSuperAdmin } from '~~/server/features/rbac/rbac.guard'
import { container } from '~~/server/utils/container'

export default defineEventHandler(async (event) => {
  await requireSuperAdmin(event)

  const id = getRequiredParam(event, 'id', 'ai.model.id_required')

  await runAiServiceCall(() =>
    container.aiProviderService.deleteModel(id),
  )

  return { success: true }
})
