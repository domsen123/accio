import * as z from 'zod'
import { requireSuperAdmin } from '~~/server/features/rbac/rbac.guard'
import { container } from '~~/server/utils/container'

const inviteSchema = z.object({
  email: z.string().trim().email('Valid email is required'),
  roleId: z.string().trim().min(1, 'Role ID is required'),
  deliveryMethod: z.enum(['email', 'link']).default('email'),
})

export default defineEventHandler(async (event) => {
  await requireSuperAdmin(event)

  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Organisation ID is required' })
  }

  const body = await readBody(event)
  const parsed = inviteSchema.safeParse(body)

  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      statusMessage: parsed.error.issues[0]?.message ?? 'Invalid input',
    })
  }

  const currentUser = event.context.user
  const inviterName = currentUser?.name ?? undefined

  // Check if user already exists
  const existingUser = await container.items.users.findOne({
    email: parsed.data.email.toLowerCase().trim(),
  })

  if (existingUser) {
    // User exists - add directly to organisation
    const result = await container.organisationMembersService.inviteMember({
      organisationId: id,
      email: parsed.data.email,
      roleId: parsed.data.roleId,
    })
    return result
  }

  if (!currentUser) {
    throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })
  }

  // User doesn't exist - create invitation
  const invitationResult = await container.organisationInvitationsService.createInvitation({
    organisationId: id,
    email: parsed.data.email,
    roleId: parsed.data.roleId,
    invitedByUserId: currentUser.id,
    inviterName,
    deliveryMethod: parsed.data.deliveryMethod,
  })

  return {
    invited: true,
    email: parsed.data.email,
    ...(invitationResult.invitationLink && { invitationLink: invitationResult.invitationLink }),
  }
})
