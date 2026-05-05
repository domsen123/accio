import { clearSessionCookie, getSessionToken } from '../../features/auth/session.utils'
import { container } from '../../utils/container'

export default defineEventHandler(async (event) => {
  const token = getSessionToken(event)
  const userId = event.context.user?.id

  if (token) {
    await container.authService.invalidateSession(token)
  }

  // T-V-11 / REQ-VAULT-4: discard the in-memory master key on logout.
  if (userId) {
    container.vaultSessionStore.evictByUser(userId)
  }

  clearSessionCookie(event)

  return { success: true }
})
