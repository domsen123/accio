import { requireSuperAdmin } from '~~/server/features/rbac/rbac.guard'
import { container } from '~~/server/utils/container'

export default defineEventHandler(async (event) => {
  await requireSuperAdmin(event)

  const query = getQuery(event)
  const search = query.search as string | undefined
  const sort = query.sort as string | string[] | undefined
  const limit = query.limit ? Number(query.limit) : undefined
  const offset = query.offset ? Number(query.offset) : undefined

  // Parse sort parameter - can be comma-separated string or array
  const sortArray = typeof sort === 'string'
    ? sort.split(',').filter(Boolean)
    : Array.isArray(sort)
      ? sort
      : ['-createdAt'] // Default sort

  // Build filter for search (name or email)
  const filter = search
    ? {
        _or: [
          { name: { _ilike: `%${search}%` } },
          { email: { _ilike: `%${search}%` } },
        ],
      }
    : undefined

  // Fetch users and count in parallel
  const [users, total] = await Promise.all([
    container.items.users.findMany({
      filter,
      sort: sortArray,
      fields: ['id', 'email', 'name', 'authProvider', 'emailVerified', 'createdAt', 'updatedAt'],
      limit,
      offset,
    }),
    container.items.users.count(filter),
  ])

  return {
    users,
    total,
  }
})
