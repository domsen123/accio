import { requireSuperAdmin } from '~~/server/features/rbac/rbac.guard'
import { container } from '~~/server/utils/container'

export default defineEventHandler(async (event) => {
  await requireSuperAdmin(event)

  const teamId = getRouterParam(event, 'teamId')

  if (!teamId) {
    throw createError({ statusCode: 400, statusMessage: 'Team ID is required' })
  }

  // Verify team exists
  const team = await container.items.teams.readOne(teamId)

  if (!team) {
    throw createError({ statusCode: 404, statusMessage: 'Team not found' })
  }

  // Fetch team members
  const members = await container.items.teamMembers.findMany({
    filter: { teamId: { _eq: teamId } },
    sort: ['createdAt'],
  })

  if (members.length === 0) {
    return { members: [], total: 0 }
  }

  // Fetch user details
  const userIds = members.map(m => m.userId)
  const users = await container.items.users.findMany({
    filter: { id: { _in: userIds } },
  })
  const usersMap = new Map(users.map(u => [u.id, u]))

  // Fetch RBAC roles for each member
  const memberRoles = await Promise.all(
    members.map(m => container.rbacService.getUserRoles(m.userId, 'team', teamId)),
  )

  // Map members with user details and RBAC role
  const membersWithUsers = members.map((member, idx) => {
    const primaryRole = memberRoles[idx]?.[0]
    return {
      id: member.id,
      teamId: member.teamId,
      userId: member.userId,
      role: primaryRole ? { id: primaryRole.id, name: primaryRole.name } : null,
      createdAt: member.createdAt,
      updatedAt: member.updatedAt,
      user: {
        id: usersMap.get(member.userId)?.id ?? member.userId,
        email: usersMap.get(member.userId)?.email ?? 'unknown',
        name: usersMap.get(member.userId)?.name ?? null,
      },
    }
  })

  return {
    members: membersWithUsers,
    total: membersWithUsers.length,
  }
})
