import * as z from 'zod'
import { requireSuperAdmin } from '~~/server/features/rbac/rbac.guard'
import { container } from '~~/server/utils/container'

const updateRoleSchema = z.object({
  roleId: z.string().trim().min(1, 'Role ID is required'),
})

export default defineEventHandler(async (event) => {
  await requireSuperAdmin(event)

  const id = getRouterParam(event, 'id')
  const userId = getRouterParam(event, 'userId')

  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Organisation ID is required' })
  }
  if (!userId) {
    throw createError({ statusCode: 400, statusMessage: 'User ID is required' })
  }

  const body = await readBody(event)
  const parsed = updateRoleSchema.safeParse(body)

  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      statusMessage: parsed.error.issues[0]?.message ?? 'Invalid input',
    })
  }

  const member = await container.organisationMembersService.updateMemberRole({
    organisationId: id,
    userId,
    newRoleId: parsed.data.roleId,
  })

  return { member }
})
