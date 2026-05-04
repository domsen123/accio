import type { H3Event } from 'h3'
import type { User } from '../../database/schema'

export const requireAuth = (event: H3Event): Omit<User, 'passwordHash'> => {
  const user = event.context.user

  if (!user) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Unauthorized',
    })
  }

  return user
}
