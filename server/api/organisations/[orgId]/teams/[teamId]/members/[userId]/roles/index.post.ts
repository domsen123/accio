import { z } from 'zod'
import { PERMISSIONS } from '~~/server/features/rbac/permissions'
import { getTeamIdFromParams, requirePermission } from '~~/server/features/rbac/rbac.guard'
import { container } from '~~/server/utils/container'

const assignRoleSchema = z.object({
  roleId: z.string().trim().min(1),
})

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
    permission: PERMISSIONS.TEAM_MEMBER_ROLE_ASSIGN,
    scope: 'team',
    getScopeId: () => teamId,
  })

  const body = await readValidatedBody(event, b => assignRoleSchema.parse(b))

  await container.rbacService.assignRole({
    userId,
    roleId: body.roleId,
    scope: 'team',
    scopeId: teamId,
  })

  return { success: true }
})
