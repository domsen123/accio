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

  const result = await container.items.users.findMany({
    filter: { id: { _eq: id } },
    fields: ['id', 'email', 'name', 'authProvider', 'emailVerified', 'createdAt', 'updatedAt'],
    limit: 1,
  })
  const user = result[0] ?? null

  if (!user) {
    throw createError({
      statusCode: 404,
      statusMessage: 'User not found',
    })
  }

  return {
    user,
  }
})
