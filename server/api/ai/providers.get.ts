/**
 * GET /api/ai/providers — list enabled providers + per-workspace credential
 * status. (T-3.1e, REQ-AI-2, DESIGN-API §AI Configuration.)
 *
 * Permission: `ai:read` on the active workspace.
 */
import { readAiQuery } from '~~/server/features/ai/api-utils'
import { listProvidersQuerySchema } from '~~/server/features/ai/schemas'
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

  const q = readAiQuery(event, listProvidersQuerySchema)
  const providers = await container.aiProviderService.listWorkspaceCredentialStatus({
    organisationId: ws.organisationId,
    includeDisabled: q.includeDisabled ?? false,
  })

  return { providers }
})
