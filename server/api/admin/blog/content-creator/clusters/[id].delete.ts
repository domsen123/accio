import { requireSuperAdmin } from '~~/server/features/rbac/rbac.guard'
import { container } from '~~/server/utils/container'

export default defineEventHandler(async (event) => {
  await requireSuperAdmin(event)

  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Cluster ID is required' })
  }

  const existing = await container.items.contentCreatorClusters.findOne({ id: { _eq: id } })
  if (!existing) {
    throw createError({ statusCode: 404, statusMessage: 'Cluster not found' })
  }

  await container.items.contentCreatorClusters.delete(id)

  return { success: true }
})
