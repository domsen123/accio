/**
 * GET /api/ai/models — enabled models, with provider info. (T-3.1e, REQ-AI-3.)
 *
 * Used by the workspace settings page model picker (REQ-AI-4 — pickers scope
 * to enabled models). Permission: `ai:read`.
 */
import { readAiQuery } from '~~/server/features/ai/api-utils'
import { listModelsQuerySchema } from '~~/server/features/ai/schemas'
import { resolveWorkspace } from '~~/server/features/kb/workspace'
import { PERMISSIONS } from '~~/server/features/rbac/permissions'
import { requirePermission } from '~~/server/features/rbac/rbac.guard'
import { container } from '~~/server/utils/container'

export default defineEventHandler(async (event) => {
  const ws = await resolveWorkspace(event)

  await requirePermission(event, {
    permission: PERMISSIONS.AI_READ,
    scope: 'organisation',
    getScopeId: () => ws.organisationId,
  })

  const q = readAiQuery(event, listModelsQuerySchema)
  const models = await container.aiProviderService.listModels({
    providerId: q.providerId,
    includeDisabled: false, // workspace view never sees disabled models
  })

  return { models }
})
