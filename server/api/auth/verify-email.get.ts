import { z } from 'zod'
import { container } from '../../utils/container'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)

  const token = z.string().min(1).parse(query.token)

  const result = await container.authService.verifyEmail(token)

  return {
    success: result.success,
    alreadyVerified: result.alreadyVerified ?? false,
  }
})
