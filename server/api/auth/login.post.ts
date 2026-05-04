import { z } from 'zod'
import { setSessionCookie } from '../../features/auth/session.utils'
import { container } from '../../utils/container'

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
  remember: z.boolean().optional().default(false),
})

export default defineEventHandler(async (event) => {
  const result = await readValidatedBody(event, body => loginSchema.parse(body))

  const { email, password, remember } = result

  const authResult = await container.authService.login(email, password, remember)

  setSessionCookie(event, authResult.token, authResult.session.expiresAt)

  return {
    user: authResult.user,
  }
})
