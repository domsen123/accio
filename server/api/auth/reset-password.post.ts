import { z } from 'zod'
import { container } from '../../utils/container'

const resetPasswordSchema = z.object({
  token: z.string().min(1, 'Reset token is required'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
})

export default defineEventHandler(async (event) => {
  const result = await readValidatedBody(event, body => resetPasswordSchema.parse(body))

  const { token, password } = result

  await container.authService.resetPassword(token, password)

  return {
    success: true,
    message: 'Your password has been reset successfully. You can now log in with your new password.',
  }
})
