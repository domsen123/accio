/**
 * PUT /api/ai/credentials/[providerId] — save or replace the workspace's
 * encrypted API key for one provider. (T-3.1e, REQ-AI-2.)
 *
 * Body: `{ apiKey, baseUrl? }`. The plaintext is encrypted with `encryptForOrg`
 * before any database write — it never leaves request scope.
 *
 * Permission: `ai:manage`.
 */
import { getRequiredParam, readAiBody, runAiServiceCall } from '~~/server/features/ai/api-utils'
import { setCredentialSchema } from '~~/server/features/ai/schemas'
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

  const providerId = getRequiredParam(event, 'providerId', 'ai.provider.id_required')
  const body = await readAiBody(event, setCredentialSchema)

  const result = await runAiServiceCall(() =>
    container.aiProviderService.setWorkspaceCredentials({
      organisationId: ws.organisationId,
      providerId,
      apiKey: body.apiKey,
      baseUrl: body.baseUrl ?? null,
      userId: ws.userId,
    }),
  )

  return { credential: result }
})
