import * as z from 'zod'
import { requireSuperAdmin } from '~~/server/features/rbac/rbac.guard'
import { container } from '~~/server/utils/container'

const schema = z.object({
  name: z.string().trim().min(1).max(100),
  slug: z.string().trim().min(1).max(100).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
})

export default defineEventHandler(async (event) => {
  await requireSuperAdmin(event)

  const body = await readBody(event)
  const data = schema.parse(body)

  const existingName = await container.items.blogTags.findOne({ name: { _eq: data.name } })
  if (existingName) {
    throw createError({ statusCode: 409, statusMessage: 'A tag with this name already exists' })
  }

  const existingSlug = await container.items.blogTags.findOne({ slug: { _eq: data.slug } })
  if (existingSlug) {
    throw createError({ statusCode: 409, statusMessage: 'A tag with this slug already exists' })
  }

  const tag = await container.items.blogTags.create(data)

  return { tag }
})
