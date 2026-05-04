import * as z from 'zod'
import { requireSuperAdmin } from '~~/server/features/rbac/rbac.guard'
import { container } from '~~/server/utils/container'

const schema = z.object({
  name: z.string().trim().min(1).max(100),
  slug: z.string().trim().min(1).max(100).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
})

export default defineEventHandler(async (event) => {
  await requireSuperAdmin(event)

  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Tag ID is required' })
  }

  const body = await readBody(event)
  const data = schema.parse(body)

  const existing = await container.items.blogTags.findOne({ id: { _eq: id } })
  if (!existing) {
    throw createError({ statusCode: 404, statusMessage: 'Tag not found' })
  }

  const nameExists = await container.items.blogTags.findOne({
    name: { _eq: data.name },
    id: { _neq: id },
  })
  if (nameExists) {
    throw createError({ statusCode: 409, statusMessage: 'A tag with this name already exists' })
  }

  const slugExists = await container.items.blogTags.findOne({
    slug: { _eq: data.slug },
    id: { _neq: id },
  })
  if (slugExists) {
    throw createError({ statusCode: 409, statusMessage: 'A tag with this slug already exists' })
  }

  const tag = await container.items.blogTags.update(id, data)

  return { tag }
})
