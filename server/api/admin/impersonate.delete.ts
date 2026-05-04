import { setSessionCookie } from '~~/server/features/auth/session.utils'
import { container } from '~~/server/utils/container'

export default defineEventHandler(async (event) => {
  const session = event.context.session
  const impersonation = event.context.impersonation

  if (!session || !impersonation) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Not currently impersonating',
    })
  }

  // Stop the impersonation and get original session ID
  const result = await container.impersonationService.stopImpersonation(session.id)

  if (!result) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Failed to stop impersonation',
    })
  }

  // Get the original admin session
  const originalSession = await container.impersonationService.getSessionById(result.originalSessionId)

  if (!originalSession) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Original session expired. Please log in again.',
    })
  }

  // Restore the original session cookie
  setSessionCookie(event, originalSession.token, originalSession.expiresAt)

  return { success: true }
})
