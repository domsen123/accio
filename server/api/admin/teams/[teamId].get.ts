import { requireSuperAdmin } from '~~/server/features/rbac/rbac.guard'
import { container } from '~~/server/utils/container'

export default defineEventHandler(async (event) => {
  await requireSuperAdmin(event)

  const teamId = getRouterParam(event, 'teamId')

  if (!teamId) {
    throw createError({ statusCode: 400, statusMessage: 'Team ID is required' })
  }

  const team = await container.items.teams.readOne(teamId)

  if (!team) {
    throw createError({ statusCode: 404, statusMessage: 'Team not found' })
  }

  // Get organisation data
  const organisation = await container.items.organisations.readOne(team.organisationId)

  return {
    team: {
      ...team,
      organisation: {
        id: team.organisationId,
        name: organisation?.name ?? 'Unknown',
      },
    },
  }
})
