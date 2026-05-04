import { z } from 'zod'
import { container } from '../../utils/container'

const forgotPasswordSchema = z.object({
  email: z.string().email('Invalid email address'),
})

export default defineEventHandler(async (event) => {
  const result = await readValidatedBody(event, body => forgotPasswordSchema.parse(body))

  const { email } = result

  await container.authService.requestPasswordReset(email)

  // Always return success to prevent email enumeration
  return {
    success: true,
    message: 'If an account exists with this email, you will receive password reset instructions.',
  }
})
