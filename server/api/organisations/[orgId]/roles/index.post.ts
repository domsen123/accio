import type { Permission } from '~~/server/features/rbac/permissions'
import { z } from 'zod'
import { PERMISSIONS } from '~~/server/features/rbac/permissions'
import { getOrgIdFromParams, requirePermission } from '~~/server/features/rbac/rbac.guard'
import { container } from '~~/server/utils/container'

const createRoleSchema = z.object({
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().max(500).optional(),
  permissions: z.array(z.string().trim()).min(1),
})

export default defineEventHandler(async (event) => {
  const orgId = getOrgIdFromParams(event)
  if (!orgId) {
    throw createError({ statusCode: 400, statusMessage: 'Organisation ID required' })
  }

  await requirePermission(event, {
    permission: PERMISSIONS.ORGANISATION_ROLE_CREATE,
    scope: 'organisation',
    getScopeId: () => orgId,
  })

  const body = await readValidatedBody(event, b => createRoleSchema.parse(b))

  const role = await container.rbacService.createRole({
    name: body.name,
    description: body.description,
    scope: 'organisation',
    organisationId: orgId,
    permissions: body.permissions as Permission[],
  })

  return { role }
})
