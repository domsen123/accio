import { requireAuth } from '~~/server/features/auth/auth.guard'
import { container } from '~~/server/utils/container'

export default defineEventHandler(async (event) => {
  const user = requireAuth(event)
  const currentSession = event.context.session
  const sessionId = getRouterParam(event, 'id')

  if (!currentSession) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Session not found',
    })
  }

  if (!sessionId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Session ID is required',
    })
  }

  // Prevent deleting current session via this endpoint
  if (sessionId === currentSession.id) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Cannot delete current session. Use logout instead.',
    })
  }

  const deleted = await container.authService.invalidateSessionById(user.id, sessionId)

  if (!deleted) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Session not found',
    })
  }

  return {
    success: true,
    message: 'Session logged out',
  }
})
