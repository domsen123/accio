/**
 * GET /api/ai/credentials — per-provider credential status for the active
 * workspace. (T-3.1e, REQ-AI-2.)
 *
 * The response NEVER includes the plaintext key, the encrypted blob, or
 * anything else that could be used to reconstruct it. Only `hasCredentials`
 * (boolean) plus the optional `baseUrl` and `updatedAt` for display.
 *
 * Permission: `ai:read`.
 */
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

  const providers = await container.aiProviderService.listWorkspaceCredentialStatus({
    organisationId: ws.organisationId,
  })

  return { credentials: providers }
})
