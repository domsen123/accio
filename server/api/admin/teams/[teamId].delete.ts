import { requireSuperAdmin } from '~~/server/features/rbac/rbac.guard'
import { container } from '~~/server/utils/container'

export default defineEventHandler(async (event) => {
  await requireSuperAdmin(event)

  const teamId = getRouterParam(event, 'teamId')

  if (!teamId) {
    throw createError({ statusCode: 400, statusMessage: 'Team ID is required' })
  }

  // Verify team exists
  const existingTeam = await container.items.teams.readOne(teamId)

  if (!existingTeam) {
    throw createError({ statusCode: 404, statusMessage: 'Team not found' })
  }

  await container.items.teams.delete(teamId)

  return { success: true }
})
