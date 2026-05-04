import { requireSuperAdmin } from '~~/server/features/rbac/rbac.guard'
import { container } from '~~/server/utils/container'

export default defineEventHandler(async (event) => {
  await requireSuperAdmin(event)

  const organisationId = getRouterParam(event, 'id')
  const invitationId = getRouterParam(event, 'invitationId')

  if (!organisationId) {
    throw createError({ statusCode: 400, statusMessage: 'Organisation ID is required' })
  }
  if (!invitationId) {
    throw createError({ statusCode: 400, statusMessage: 'Invitation ID is required' })
  }

  return container.organisationInvitationsService.resendInvitation(invitationId)
})
