/**
 * PATCH /api/ai/settings — alias of PUT for clients that prefer PATCH.
 *
 * DESIGN-API §AI Configuration lists `PATCH /api/ai/workspace-settings`; we
 * expose both verbs at `/api/ai/settings` so the route works regardless of
 * which method clients pick. See `settings.put.ts` for the implementation
 * surface — both files share the same handler body.
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
