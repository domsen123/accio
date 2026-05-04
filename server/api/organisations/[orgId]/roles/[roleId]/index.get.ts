import { PERMISSIONS } from '~~/server/features/rbac/permissions'
import { getOrgIdFromParams, requirePermission } from '~~/server/features/rbac/rbac.guard'
import { container } from '~~/server/utils/container'

export default defineEventHandler(async (event) => {
  const orgId = getOrgIdFromParams(event)
  const roleId = getRouterParam(event, 'roleId')

  if (!orgId) {
    throw createError({ statusCode: 400, statusMessage: 'Organisation ID required' })
  }
  if (!roleId) {
    throw createError({ statusCode: 400, statusMessage: 'Role ID required' })
  }

  await requirePermission(event, {
    permission: PERMISSIONS.ORGANISATION_READ,
    scope: 'organisation',
    getScopeId: () => orgId,
  })

  const role = await container.rbacService.getRoleWithPermissions(roleId)

  if (!role) {
    throw createError({ statusCode: 404, statusMessage: 'Role not found' })
  }

  return { role }
})
