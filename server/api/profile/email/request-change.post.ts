import * as z from 'zod'
import { requireAuth } from '~~/server/features/auth/auth.guard'
import { container } from '~~/server/utils/container'

const requestEmailChangeSchema = z.object({
  email: z.string().trim().email('Valid email is required'),
})

export default defineEventHandler(async (event) => {
  const user = requireAuth(event)

  const body = await readBody(event)
  const parsed = requestEmailChangeSchema.safeParse(body)

  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      statusMessage: parsed.error.issues[0]?.message ?? 'Invalid input',
    })
  }

  const result = await container.profileService.requestEmailChange(user.id, {
    newEmail: parsed.data.email,
  })

  return result
})
