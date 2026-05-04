import { requireAuth } from '~~/server/features/auth/auth.guard'
import { container } from '~~/server/utils/container'

export default defineEventHandler(async (event) => {
  const user = requireAuth(event)

  const pending = await container.profileService.getPendingEmailChange(user.id)

  return { pending }
})
