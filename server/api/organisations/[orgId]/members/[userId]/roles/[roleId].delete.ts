import { PERMISSIONS } from '~~/server/features/rbac/permissions'
import { getOrgIdFromParams, requirePermission } from '~~/server/features/rbac/rbac.guard'
import { container } from '~~/server/utils/container'

export default defineEventHandler(async (event) => {
  const orgId = getOrgIdFromParams(event)
  const userId = getRouterParam(event, 'userId')
  const roleId = getRouterParam(event, 'roleId')

  if (!orgId) {
    throw createError({ statusCode: 400, statusMessage: 'Organisation ID required' })
  }
  if (!userId) {
    throw createError({ statusCode: 400, statusMessage: 'User ID required' })
  }
  if (!roleId) {
    throw createError({ statusCode: 400, statusMessage: 'Role ID required' })
  }

  await requirePermission(event, {
    permission: PERMISSIONS.ORGANISATION_MEMBER_ROLE_ASSIGN,
    scope: 'organisation',
    getScopeId: () => orgId,
  })

  await container.rbacService.removeRole(userId, roleId, 'organisation', orgId)

  return { success: true }
})
