import * as z from 'zod'
import { requireSuperAdmin } from '~~/server/features/rbac/rbac.guard'
import { container } from '~~/server/utils/container'

const schema = z.object({
  name: z.string().trim().min(1).max(100),
  slug: z.string().trim().min(1).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  ownerId: z.string().trim().optional(),
})

export default defineEventHandler(async (event) => {
  await requireSuperAdmin(event)
  const user = event.context.user!

  const body = await readBody(event)
  const data = schema.parse(body)

  // Use provided ownerId or default to current admin user
  const creatorUserId = data.ownerId || user.id

  const result = await container.organisationsService.create({
    name: data.name,
    slug: data.slug,
    creatorUserId,
  })

  return {
    organisation: result,
  }
})
