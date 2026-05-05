/**
 * PATCH /api/admin/ai/models/[id] — update a model row.
 *
 * (T-3.1e, REQ-AI-3.) Platform-admin only. Toggling `isDefault: true`
 * unsets the previous default in the same transaction.
 */
import { getRequiredParam, readAiBody, runAiServiceCall } from '~~/server/features/ai/api-utils'
import { updateModelSchema } from '~~/server/features/ai/schemas'
import { requireSuperAdmin } from '~~/server/features/rbac/rbac.guard'
import { container } from '~~/server/utils/container'

export default defineEventHandler(async (event) => {
  await requireSuperAdmin(event)

  const id = getRequiredParam(event, 'id', 'ai.model.id_required')
  const body = await readAiBody(event, updateModelSchema)

  const model = await runAiServiceCall(() =>
    container.aiProviderService.updateModel(id, {
      modelId: body.modelId,
      displayName: body.displayName,
      contextWindow: body.contextWindow,
      supportsTools: body.supportsTools,
      supportsStreaming: body.supportsStreaming,
      supportsVision: body.supportsVision,
      inputPricePerMtok: body.inputPricePerMtok,
      outputPricePerMtok: body.outputPricePerMtok,
      enabled: body.enabled,
      isDefault: body.isDefault,
    }),
  )

  return { model }
})
