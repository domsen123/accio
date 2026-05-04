import type { Permission } from '~~/server/features/rbac/permissions'
import { z } from 'zod'
import { PERMISSIONS } from '~~/server/features/rbac/permissions'
import { getOrgIdFromParams, requirePermission } from '~~/server/features/rbac/rbac.guard'
import { container } from '~~/server/utils/container'

const updateRoleSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  description: z.string().trim().max(500).optional(),
  permissions: z.array(z.string().trim()).optional(),
})

export default defineEventHandler(async (event) => {
  const orgId = getOrgIdFromParams(event)
  const roleId = getRouterParam(event, 'roleId')

  if (!orgId) {
    throw createError({ statusCode: 400, statusMessage: 'Organisation ID required' })
  }
  if (!roleId) {
    throw createError({ statusCode: 400, statusMessage: 'Role ID required' })
  }

  await requirePermission(event, {
    permission: PERMISSIONS.ORGANISATION_ROLE_UPDATE,
    scope: 'organisation',
    getScopeId: () => orgId,
  })

  const body = await readValidatedBody(event, b => updateRoleSchema.parse(b))

  const role = await container.rbacService.updateRole(roleId, {
    name: body.name,
    description: body.description,
    permissions: body.permissions as Permission[] | undefined,
  })

  return { role }
})
