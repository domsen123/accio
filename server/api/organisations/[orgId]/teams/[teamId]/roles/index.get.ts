import { PERMISSIONS } from '~~/server/features/rbac/permissions'
import { getTeamIdFromParams, requirePermission } from '~~/server/features/rbac/rbac.guard'
import { container } from '~~/server/utils/container'

export default defineEventHandler(async (event) => {
  const teamId = getTeamIdFromParams(event)

  if (!teamId) {
    throw createError({ statusCode: 400, statusMessage: 'Team ID required' })
  }

  await requirePermission(event, {
    permission: PERMISSIONS.TEAM_READ,
    scope: 'team',
    getScopeId: () => teamId,
  })

  const roles = await container.rbacService.getRolesByScope('team')

  return { roles }
})
