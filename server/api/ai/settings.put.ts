/**
 * PUT /api/ai/settings — partial update of workspace AI settings.
 *
 * (T-3.1e, REQ-AI-4.) Permission: `ai:manage`.
 *
 * The DESIGN-API spec also lists this as PATCH; we accept both — see the
 * sibling `settings.patch.ts`.
 */
import { readAiBody, runAiServiceCall } from '~~/server/features/ai/api-utils'
import { updateWorkspaceSettingsSchema } from '~~/server/features/ai/schemas'
import { resolveWorkspace } from '~~/server/features/kb/workspace'
import { PERMISSIONS } from '~~/server/features/rbac/permissions'
import { requirePermission } from '~~/server/features/rbac/rbac.guard'
import { container } from '~~/server/utils/container'

export default defineEventHandler(async (event) => {
  const ws = await resolveWorkspace(event)

  await requirePermission(event, {
    permission: PERMISSIONS.AI_MANAGE,
    scope: 'organisation',
    getScopeId: () => ws.organisationId,
  })

  const body = await readAiBody(event, updateWorkspaceSettingsSchema)

  const settings = await runAiServiceCall(() =>
    container.aiProviderService.setWorkspaceSettings({
      organisationId: ws.organisationId,
      defaultModelId: body.defaultModelId,
      aiDisplayName: body.aiDisplayName,
      historyLimit: body.historyLimit,
      systemPrompt: body.systemPrompt,
    }),
  )

  return { settings }
})
