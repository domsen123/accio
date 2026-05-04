import * as z from 'zod'
import { container } from '~~/server/utils/container'

const confirmEmailChangeSchema = z.object({
  token: z.string().min(1, 'Token is required'),
})

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const parsed = confirmEmailChangeSchema.safeParse(query)

  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      statusMessage: parsed.error.issues[0]?.message ?? 'Invalid token',
    })
  }

  const result = await container.profileService.confirmEmailChange(parsed.data.token)

  return result
})
