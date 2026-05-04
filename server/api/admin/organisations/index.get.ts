import { requireSuperAdmin } from '~~/server/features/rbac/rbac.guard'
import { container } from '~~/server/utils/container'

export default defineEventHandler(async (event) => {
  // Only platform admins can access
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

  // Build filter for search (name or slug)
  const filter = search
    ? {
        _or: [
          { name: { _ilike: `%${search}%` } },
          { slug: { _ilike: `%${search}%` } },
        ],
      }
    : undefined

  // Fetch organisations and count in parallel
  const [organisations, total] = await Promise.all([
    container.items.organisations.findMany({
      filter,
      sort: sortArray,
      limit,
      offset,
    }),
    container.items.organisations.count(filter),
  ])

  return {
    organisations,
    total,
  }
})
