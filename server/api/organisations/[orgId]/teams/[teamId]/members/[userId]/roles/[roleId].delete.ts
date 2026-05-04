import { PERMISSIONS } from '~~/server/features/rbac/permissions'
import { getTeamIdFromParams, requirePermission } from '~~/server/features/rbac/rbac.guard'
import { container } from '~~/server/utils/container'

export default defineEventHandler(async (event) => {
  const teamId = getTeamIdFromParams(event)
  const userId = getRouterParam(event, 'userId')
  const roleId = getRouterParam(event, 'roleId')

  if (!teamId) {
    throw createError({ statusCode: 400, statusMessage: 'Team ID required' })
  }
  if (!userId) {
    throw createError({ statusCode: 400, statusMessage: 'User ID required' })
  }
  if (!roleId) {
    throw createError({ statusCode: 400, statusMessage: 'Role ID required' })
  }

  await requirePermission(event, {
    permission: PERMISSIONS.TEAM_MEMBER_ROLE_ASSIGN,
    scope: 'team',
    getScopeId: () => teamId,
  })

  await container.rbacService.removeRole(userId, roleId, 'team', teamId)

  return { success: true }
})
