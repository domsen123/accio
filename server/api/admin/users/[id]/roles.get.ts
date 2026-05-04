import { requireSuperAdmin } from '~~/server/features/rbac/rbac.guard'
import { container } from '~~/server/utils/container'

export default defineEventHandler(async (event) => {
  await requireSuperAdmin(event)

  const id = getRouterParam(event, 'id')

  if (!id) {
    throw createError({
      statusCode: 400,
      statusMessage: 'User ID is required',
    })
  }

  // Verify user exists
  const user = await container.items.users.readOne(id)
  if (!user) {
    throw createError({
      statusCode: 404,
      statusMessage: 'User not found',
    })
  }

  // Get user's global roles with permissions
  const roles = await container.rbacService.getUserRoles(id, 'global')

  return {
    roles: roles.map(role => ({
      id: role.id,
      name: role.name,
      description: role.description,
      scope: role.scope,
      isSystem: role.isSystem,
      isDefault: role.isDefault,
      permissions: role.permissions.map(p => ({
        permission: p.permission,
      })),
    })),
  }
})
