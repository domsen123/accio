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

  const count = await container.authService.invalidateOtherSessions(user.id, session.id)

  return {
    success: true,
    count,
    message: count > 0 ? `${count} session(s) logged out` : 'No other sessions found',
  }
})
