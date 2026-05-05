/**
 * POST /api/admin/ai/models — create a new model row in the registry.
 *
 * (T-3.1e, REQ-AI-3.) Platform-admin only. If `isDefault: true`, the previous
 * default is unset in the same transaction.
 */
import { readAiBody, runAiServiceCall } from '~~/server/features/ai/api-utils'
import { createModelSchema } from '~~/server/features/ai/schemas'
import { requireSuperAdmin } from '~~/server/features/rbac/rbac.guard'
import { container } from '~~/server/utils/container'

export default defineEventHandler(async (event) => {
  await requireSuperAdmin(event)

  const body = await readAiBody(event, createModelSchema)

  const model = await runAiServiceCall(() =>
    container.aiProviderService.createModel({
      providerId: body.providerId,
      modelId: body.modelId,
      displayName: body.displayName,
      contextWindow: body.contextWindow,
      supportsTools: body.supportsTools,
      supportsStreaming: body.supportsStreaming,
      supportsVision: body.supportsVision,
      inputPricePerMtok: body.inputPricePerMtok ?? null,
      outputPricePerMtok: body.outputPricePerMtok ?? null,
      enabled: body.enabled,
      isDefault: body.isDefault,
    }),
  )

  setResponseStatus(event, 201)
  return { model }
})
