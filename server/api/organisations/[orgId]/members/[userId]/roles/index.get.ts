import { PERMISSIONS } from '~~/server/features/rbac/permissions'
import { getOrgIdFromParams, requirePermission } from '~~/server/features/rbac/rbac.guard'
import { container } from '~~/server/utils/container'

export default defineEventHandler(async (event) => {
  const orgId = getOrgIdFromParams(event)
  const userId = getRouterParam(event, 'userId')

  if (!orgId) {
    throw createError({ statusCode: 400, statusMessage: 'Organisation ID required' })
  }
  if (!userId) {
    throw createError({ statusCode: 400, statusMessage: 'User ID required' })
  }

  await requirePermission(event, {
    permission: PERMISSIONS.ORGANISATION_MEMBER_VIEW,
    scope: 'organisation',
    getScopeId: () => orgId,
  })

  const roles = await container.rbacService.getUserRoles(userId, 'organisation', orgId)

  return { roles }
})
