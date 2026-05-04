import { requireSuperAdmin } from '~~/server/features/rbac/rbac.guard'
import { container } from '~~/server/utils/container'

export default defineEventHandler(async (event) => {
  await requireSuperAdmin(event)

  const organisationId = getRouterParam(event, 'id')
  if (!organisationId) {
    throw createError({ statusCode: 400, statusMessage: 'Organisation ID is required' })
  }

  // Verify organisation exists
  const organisation = await container.items.organisations.readOne(organisationId)
  if (!organisation) {
    throw createError({ statusCode: 404, statusMessage: 'Organisation not found' })
  }

  return container.organisationInvitationsService.listByOrganisation(organisationId)
})
