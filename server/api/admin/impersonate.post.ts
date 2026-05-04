import * as z from 'zod'
import { setSessionCookie } from '~~/server/features/auth/session.utils'
import { requireSuperAdmin } from '~~/server/features/rbac/rbac.guard'
import { container } from '~~/server/utils/container'

const schema = z.object({
  userId: z.string().trim().min(1),
})

export default defineEventHandler(async (event) => {
  await requireSuperAdmin(event)

  const body = await readBody(event)
  const data = schema.parse(body)

  const adminUser = event.context.user!
  const adminSession = event.context.session!

  // Prevent nested impersonation
  if (event.context.impersonation) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Cannot start impersonation while already impersonating',
    })
  }

  const { session, token } = await container.impersonationService.startImpersonation(
    adminUser.id,
    adminSession.id,
    data.userId,
  )

  // Set the new impersonation session cookie
  setSessionCookie(event, token, session.expiresAt)

  return { success: true }
})
