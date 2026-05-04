import * as z from 'zod'
import { requireSuperAdmin } from '~~/server/features/rbac/rbac.guard'
import { container } from '~~/server/utils/container'

const schema = z.object({
  name: z.string().trim().min(1).max(100),
  slug: z.string().trim().min(1).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
})

export default defineEventHandler(async (event) => {
  await requireSuperAdmin(event)

  const id = getRouterParam(event, 'id')

  if (!id) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Organisation ID is required',
    })
  }

  const body = await readBody(event)
  const data = schema.parse(body)

  // Check if organisation exists
  const existing = await container.items.organisations.findOne({
    id: { _eq: id },
  })

  if (!existing) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Organisation not found',
    })
  }

  // Check if slug already exists (excluding current organisation)
  const slugExists = await container.items.organisations.findOne({
    slug: { _eq: data.slug },
    id: { _neq: id },
  })

  if (slugExists) {
    throw createError({
      statusCode: 409,
      statusMessage: 'An organisation with this slug already exists',
    })
  }

  const organisation = await container.items.organisations.update(id, data)

  return {
    organisation,
  }
})
