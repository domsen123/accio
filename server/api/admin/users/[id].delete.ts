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

  const existing = await container.items.users.findOne({
    id: { _eq: id },
  })

  if (!existing) {
    throw createError({
      statusCode: 404,
      statusMessage: 'User not found',
    })
  }

  await container.items.users.delete(id)

  return {
    success: true,
  }
})
