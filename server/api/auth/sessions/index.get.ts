import { requireAuth } from '~~/server/features/auth/auth.guard'
import { container } from '~~/server/utils/container'

export default defineEventHandler(async (event) => {
  const user = requireAuth(event)
  const session = event.context.session

  if (!session) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Session not found',
    })
  }

  const sessions = await container.authService.getUserSessions(user.id, session.id)

  return { sessions }
})
