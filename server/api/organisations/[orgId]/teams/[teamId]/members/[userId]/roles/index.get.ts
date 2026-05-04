import { PERMISSIONS } from '~~/server/features/rbac/permissions'
import { getTeamIdFromParams, requirePermission } from '~~/server/features/rbac/rbac.guard'
import { container } from '~~/server/utils/container'

export default defineEventHandler(async (event) => {
  const teamId = getTeamIdFromParams(event)
  const userId = getRouterParam(event, 'userId')

  if (!teamId) {
    throw createError({ statusCode: 400, statusMessage: 'Team ID required' })
  }
  if (!userId) {
    throw createError({ statusCode: 400, statusMessage: 'User ID required' })
  }

  await requirePermission(event, {
    permission: PERMISSIONS.TEAM_MEMBER_VIEW,
    scope: 'team',
    getScopeId: () => teamId,
  })

  const roles = await container.rbacService.getUserRoles(userId, 'team', teamId)

  return { roles }
})
