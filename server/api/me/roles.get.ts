import { requireAuth } from '~~/server/features/rbac/rbac.guard'
import { container } from '~~/server/utils/container'

export default defineEventHandler(async (event) => {
  const user = requireAuth(event)

  const roles = await container.rbacService.getUserRoles(user.id)

  return { roles }
})
