import * as z from 'zod'
import { requireSuperAdmin } from '~~/server/features/rbac/rbac.guard'
import { container } from '~~/server/utils/container'

const schema = z.object({
  seedTopic: z.string().trim().min(1).max(200),
})

export default defineEventHandler(async (event) => {
  await requireSuperAdmin(event)

  const body = await readBody(event)
  const data = schema.parse(body)

  const pillars = await container.contentCreatorService.generatePillars(data.seedTopic)

  return { pillars }
})
