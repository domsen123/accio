/**
 * POST /api/projects/connection — store a fresh GitHub PAT for the workspace
 * (T-4.6, REQ-PROJ-1).
 *
 * Validates the token against `GET /user` before persisting. Returns the
 * minimal identity envelope (`{ connected, ghUserLogin, ghUserId, scopes }`).
 *
 * Permission: `project:manage`.
 */
import { resolveWorkspace } from '~~/server/features/kb/workspace'
import { connectBodySchema } from '~~/server/features/projects/api-schemas'
import {
  readProjectsBody,
  runProjectsServiceCall,
} from '~~/server/features/projects/api-utils'
import { PERMISSIONS } from '~~/server/features/rbac/permissions'
import { requirePermission } from '~~/server/features/rbac/rbac.guard'
import { container } from '~~/server/utils/container'

export default defineEventHandler(async (event) => {
  const ws = await resolveWorkspace(event)

  await requirePermission(event, {
    permission: PERMISSIONS.PROJECT_MANAGE,
    scope: 'organisation',
    getScopeId: () => ws.organisationId,
  })

  const input = await readProjectsBody(event, connectBodySchema)

  const result = await runProjectsServiceCall(() =>
    container.ghConnectionsService.connect({
      organisationId: ws.organisationId,
      token: input.token,
    }),
  )

  return result
})
