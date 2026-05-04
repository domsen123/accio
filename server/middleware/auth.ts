import { getSessionToken, setSessionCookie } from '../features/auth/session.utils'
import { container } from '../utils/container'

export default defineEventHandler(async (event) => {
  // Initialize context with null values
  event.context.session = null
  event.context.user = null
  event.context.impersonation = null

  const token = getSessionToken(event)

  if (!token) {
    return
  }

  const result = await container.authService.validateSession(token)

  if (!result) {
    return
  }

  event.context.session = result.session
  event.context.user = result.user

  // If this is an impersonation session, expose that info
  if (result.session.impersonatingUserId) {
    event.context.impersonation = {
      originalUserId: result.session.impersonatingUserId,
      originalSessionId: result.session.originalSessionId,
    }
  }

  // Sliding session: auto-refresh if nearing expiration (skip for impersonation sessions)
  if (!result.session.impersonatingUserId && container.authService.shouldRefreshSession(result.session)) {
    const refreshedSession = await container.authService.refreshSession(result.session.id)
    event.context.session = refreshedSession
    setSessionCookie(event, token, refreshedSession.expiresAt)
  }
})
