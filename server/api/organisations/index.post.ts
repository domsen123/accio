import * as z from 'zod'
import { PERMISSIONS } from '~~/server/features/rbac/permissions'
import { requireAuth, requirePermission } from '~~/server/features/rbac/rbac.guard'
import { container } from '~~/server/utils/container'

const schema = z.object({
  name: z.string().trim().min(1).max(100),
  slug: z.string().trim().min(1).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
})

export default defineEventHandler(async (event) => {
  const user = requireAuth(event)

  // Check organisation:create permission (global scope)
  await requirePermission(event, {
    permission: PERMISSIONS.ORGANISATION_CREATE,
    scope: 'global',
  })

  const body = await readBody(event)
  const data = schema.parse(body)

  const result = await container.organisationsService.create({
    name: data.name,
    slug: data.slug,
    creatorUserId: user.id,
  })

  return {
    organisation: result,
  }
})
