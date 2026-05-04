import { requireSuperAdmin } from '~~/server/features/rbac/rbac.guard'
import { container } from '~~/server/utils/container'

export default defineEventHandler(async (event) => {
  await requireSuperAdmin(event)

  const roleId = getRouterParam(event, 'roleId')
  if (!roleId) {
    throw createError({ statusCode: 400, statusMessage: 'Role ID required' })
  }

  await container.rbacService.deleteRole(roleId)

  return { success: true }
})
