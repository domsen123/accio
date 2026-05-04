import * as z from 'zod'
import { requireSuperAdmin } from '~~/server/features/rbac/rbac.guard'
import { container } from '~~/server/utils/container'

const schema = z.object({
  pillarId: z.string().trim().min(1),
})

export default defineEventHandler(async (event) => {
  await requireSuperAdmin(event)

  const body = await readBody(event)
  const data = schema.parse(body)

  const clusters = await container.contentCreatorService.generateClusters(data.pillarId)

  return { clusters }
})
