import { requireSuperAdmin } from '~~/server/features/rbac/rbac.guard'
import { container } from '~~/server/utils/container'

export default defineEventHandler(async (event) => {
  await requireSuperAdmin(event)

  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Organisation ID is required' })
  }

  // Verify organisation exists
  const org = await container.items.organisations.readOne(id)
  if (!org) {
    throw createError({ statusCode: 404, statusMessage: 'Organisation not found' })
  }

  const teams = await container.items.teams.findMany({
    filter: { organisationId: { _eq: id } },
    sort: ['-createdAt'],
  })

  return {
    teams,
    total: teams.length,
  }
})
