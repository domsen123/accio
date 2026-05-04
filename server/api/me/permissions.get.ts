import { getPermissionContext, requireAuth } from '~~/server/features/rbac/rbac.guard'

export default defineEventHandler(async (event) => {
  requireAuth(event)
  const context = await getPermissionContext(event)

  if (!context) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to load permissions',
    })
  }

  return {
    userId: context.userId,
    global: Array.from(context.globalPermissions),
    organisations: Object.fromEntries(
      Array.from(context.organisationPermissions.entries()).map(
        ([orgId, perms]) => [orgId, Array.from(perms)],
      ),
    ),
    teams: Object.fromEntries(
      Array.from(context.teamPermissions.entries()).map(
        ([teamId, perms]) => [teamId, Array.from(perms)],
      ),
    ),
  }
})
