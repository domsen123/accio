import * as z from 'zod'
import { requireAuth } from '~~/server/features/auth/auth.guard'
import { container } from '~~/server/utils/container'

const querySchema = z.object({
  entityType: z.string().trim().min(1),
  entityId: z.string().trim().min(1),
  includeVariants: z.coerce.boolean().optional(),
})

export default defineEventHandler(async (event) => {
  requireAuth(event)

  const query = await getValidatedQuery(event, q => querySchema.parse(q))

  const files = await container.fileService.getFilesByEntity(query.entityType, query.entityId, {
    includeVariants: query.includeVariants,
  })

  return { files }
})
