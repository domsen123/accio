import { clearSessionCookie, getSessionToken } from '../../features/auth/session.utils'
import { container } from '../../utils/container'

export default defineEventHandler(async (event) => {
  const token = getSessionToken(event)

  if (token) {
    await container.authService.invalidateSession(token)
  }

  clearSessionCookie(event)

  return { success: true }
})
