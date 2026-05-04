import { requireSuperAdmin } from '~~/server/features/rbac/rbac.guard'
import { container } from '~~/server/utils/container'

export default defineEventHandler(async (event) => {
  await requireSuperAdmin(event)

  const teamId = getRouterParam(event, 'teamId')

  if (!teamId) {
    throw createError({ statusCode: 400, statusMessage: 'Team ID is required' })
  }

  // Verify team exists and get organisationId
  const team = await container.items.teams.readOne(teamId)

  if (!team) {
    throw createError({ statusCode: 404, statusMessage: 'Team not found' })
  }

  // Get all organisation members
  const orgMembers = await container.items.organisationMembers.findMany({
    filter: { organisationId: { _eq: team.organisationId } },
  })

  if (orgMembers.length === 0) {
    return { members: [] }
  }

  // Get existing team members
  const teamMembers = await container.items.teamMembers.findMany({
    filter: { teamId: { _eq: teamId } },
  })
  const existingMemberUserIds = new Set(teamMembers.map(tm => tm.userId))

  // Filter out users who are already in the team
  const eligibleUserIds = orgMembers
    .map(m => m.userId)
    .filter(userId => !existingMemberUserIds.has(userId))

  if (eligibleUserIds.length === 0) {
    return { members: [] }
  }

  // Fetch user details
  const users = await container.items.users.findMany({
    filter: { id: { _in: eligibleUserIds } },
  })

  const eligibleMembers = users.map(user => ({
    id: user.id,
    email: user.email,
    name: user.name,
  }))

  return { members: eligibleMembers }
})
