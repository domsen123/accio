import { z } from 'zod'
import { container } from '../../utils/container'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)

  const token = z.string().min(1).parse(query.token)

  const validation = await container.authService.validateResetToken(token)

  return {
    valid: validation.valid,
  }
})
