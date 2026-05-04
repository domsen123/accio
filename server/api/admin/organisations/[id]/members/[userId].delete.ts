import { requireSuperAdmin } from '~~/server/features/rbac/rbac.guard'
import { container } from '~~/server/utils/container'

export default defineEventHandler(async (event) => {
  await requireSuperAdmin(event)

  const id = getRouterParam(event, 'id')
  const userId = getRouterParam(event, 'userId')

  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Organisation ID is required' })
  }
  if (!userId) {
    throw createError({ statusCode: 400, statusMessage: 'User ID is required' })
  }

  await container.organisationMembersService.removeMember(id, userId)

  return { success: true }
})
