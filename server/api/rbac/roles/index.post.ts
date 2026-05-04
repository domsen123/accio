import type { Permission } from '~~/server/features/rbac/permissions'
import { z } from 'zod'
import { requireSuperAdmin } from '~~/server/features/rbac/rbac.guard'
import { container } from '~~/server/utils/container'

const createRoleSchema = z.object({
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().max(500).optional(),
  permissions: z.array(z.string().trim()).min(1),
})

export default defineEventHandler(async (event) => {
  await requireSuperAdmin(event)

  const body = await readValidatedBody(event, b => createRoleSchema.parse(b))

  const role = await container.rbacService.createRole({
    name: body.name,
    description: body.description,
    scope: 'global',
    permissions: body.permissions as Permission[],
  })

  return { role }
})
