import { requireSuperAdmin } from '~~/server/features/rbac/rbac.guard'
import { container } from '~~/server/utils/container'

export default defineEventHandler(async (event) => {
  await requireSuperAdmin(event)

  const id = getRouterParam(event, 'id')

  if (!id) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Organisation ID is required',
    })
  }

  const organisation = await container.items.organisations.findOne({
    id: { _eq: id },
  })

  if (!organisation) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Organisation not found',
    })
  }

  return {
    organisation,
  }
})
