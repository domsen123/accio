import { count, eq, gt } from 'drizzle-orm'
import { organisations, sessions, teams, users } from '~~/server/database/schema'
import { requireSuperAdmin } from '~~/server/features/rbac/rbac.guard'
import { getDatabase } from '~~/server/infrastructure/database/client'

export default defineEventHandler(async (event) => {
  await requireSuperAdmin(event)

  const db = getDatabase()

  const [
    usersResult,
    verifiedResult,
    orgsResult,
    teamsResult,
    sessionsResult,
  ] = await Promise.all([
    db.select({ count: count() }).from(users),
    db.select({ count: count() }).from(users).where(eq(users.emailVerified, true)),
    db.select({ count: count() }).from(organisations),
    db.select({ count: count() }).from(teams),
    db.select({ count: count() }).from(sessions).where(gt(sessions.expiresAt, new Date())),
  ])

  const totalUsers = usersResult[0]?.count ?? 0
  const verifiedUsers = verifiedResult[0]?.count ?? 0
  const totalOrganisations = orgsResult[0]?.count ?? 0
  const totalTeams = teamsResult[0]?.count ?? 0
  const activeSessions = sessionsResult[0]?.count ?? 0

  return {
    totalUsers,
    verifiedUsers,
    unverifiedUsers: totalUsers - verifiedUsers,
    totalOrganisations,
    totalTeams,
    activeSessions,
  }
})
