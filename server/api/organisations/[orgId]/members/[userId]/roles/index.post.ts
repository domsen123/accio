import { z } from 'zod'
import { PERMISSIONS } from '~~/server/features/rbac/permissions'
import { getOrgIdFromParams, requirePermission } from '~~/server/features/rbac/rbac.guard'
import { container } from '~~/server/utils/container'

const assignRoleSchema = z.object({
  roleId: z.string().trim().min(1),
})

export default defineEventHandler(async (event) => {
  const orgId = getOrgIdFromParams(event)
  const userId = getRouterParam(event, 'userId')

  if (!orgId) {
    throw createError({ statusCode: 400, statusMessage: 'Organisation ID required' })
  }
  if (!userId) {
    throw createError({ statusCode: 400, statusMessage: 'User ID required' })
  }

  await requirePermission(event, {
    permission: PERMISSIONS.ORGANISATION_MEMBER_ROLE_ASSIGN,
    scope: 'organisation',
    getScopeId: () => orgId,
  })

  const body = await readValidatedBody(event, b => assignRoleSchema.parse(b))

  await container.rbacService.assignRole({
    userId,
    roleId: body.roleId,
    scope: 'organisation',
    scopeId: orgId,
  })

  return { success: true }
})
