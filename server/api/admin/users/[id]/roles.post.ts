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

  const body = await readBody<{ roleId: string }>(event)

  if (!body?.roleId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Role ID is required',
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

  await container.rbacService.assignRole({
    userId: id,
    roleId: body.roleId,
    scope: 'global',
  })

  return { success: true }
})
