/**
 * PATCH /api/admin/ai/providers/[id] — toggle the provider's `enabled` flag.
 *
 * (T-3.1e, REQ-AI-1, REQ-AI-3.) We deliberately do not expose POST/DELETE
 * here — adding a provider requires a bundled SDK adapter (ADR-013) and so
 * is not a runtime operation.
 */
import { getRequiredParam, readAiBody, runAiServiceCall } from '~~/server/features/ai/api-utils'
import { updateProviderSchema } from '~~/server/features/ai/schemas'
import { requireSuperAdmin } from '~~/server/features/rbac/rbac.guard'
import { container } from '~~/server/utils/container'

export default defineEventHandler(async (event) => {
  await requireSuperAdmin(event)

  const id = getRequiredParam(event, 'id', 'ai.provider.id_required')
  const body = await readAiBody(event, updateProviderSchema)

  const provider = await runAiServiceCall(() =>
    container.aiProviderService.updateProvider(id, { enabled: body.enabled }),
  )

  return { provider }
})
