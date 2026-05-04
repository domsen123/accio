import * as z from 'zod'
import { requireSuperAdmin } from '~~/server/features/rbac/rbac.guard'
import { container } from '~~/server/utils/container'

const schema = z.object({
  action: z.enum(['confirm', 'reject']),
})

export default defineEventHandler(async (event) => {
  await requireSuperAdmin(event)

  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Pillar ID is required' })
  }

  const body = await readBody(event)
  const data = schema.parse(body)

  let pillar
  if (data.action === 'confirm') {
    pillar = await container.contentCreatorService.confirmPillar(id)
  }
  else {
    pillar = await container.contentCreatorService.rejectPillar(id)
  }

  return { pillar }
})
