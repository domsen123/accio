import { z } from 'zod'
import { setSessionCookie } from '../../features/auth/session.utils'
import { container } from '../../utils/container'

const registerSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  name: z.string().optional(),
})

export default defineEventHandler(async (event) => {
  const result = await readValidatedBody(event, body => registerSchema.parse(body))

  const { email, password, name } = result

  // If current user is anonymous, upgrade their account instead of creating a new one
  const currentUser = event.context.user
  const isAnonymousUpgrade = currentUser && currentUser.authProvider === 'anonymous'

  const authResult = await container.authService.register(email, password, name, {
    existingUserId: isAnonymousUpgrade ? currentUser.id : undefined,
  })

  // Only set a new cookie if this is not an upgrade (upgrade keeps existing session)
  if (!isAnonymousUpgrade) {
    setSessionCookie(event, authResult.token, authResult.session.expiresAt)
  }

  return {
    user: authResult.user,
  }
})
