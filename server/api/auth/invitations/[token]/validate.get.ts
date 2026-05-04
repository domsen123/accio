import { container } from '~~/server/utils/container'

export default defineEventHandler(async (event) => {
  const token = getRouterParam(event, 'token')

  if (!token) {
    throw createError({ statusCode: 400, statusMessage: 'Token is required' })
  }

  const validation = await container.organisationInvitationsService.validateInvitation(token)

  return validation
})
