import { requireSuperAdmin } from '~~/server/features/rbac/rbac.guard'

export default defineEventHandler(async (event) => {
  await requireSuperAdmin(event)

  const { result } = await runTask('cleanup:tokens')

  return result
})
