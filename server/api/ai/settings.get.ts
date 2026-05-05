/**
 * GET /api/ai/settings — orchestrator workspace settings (default model, AI
 * display name, history limit, system prompt). (T-3.1e, REQ-AI-4.)
 *
 * Creates the row on first read with platform defaults so callers always get
 * a usable shape back.
 *
 * Permission: `ai:read`.
 */
import { runAiServiceCall } from '~~/server/features/ai/api-utils'
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

  const settings = await runAiServiceCall(() =>
    container.aiProviderService.getWorkspaceSettings({
      organisationId: ws.organisationId,
    }),
  )

  return { settings }
})
