import { requireSuperAdmin } from '~~/server/features/rbac/rbac.guard'
import { container } from '~~/server/utils/container'

export default defineEventHandler(async (event) => {
  await requireSuperAdmin(event)

  const query = getQuery(event)
  const search = query.search as string | undefined
  const sort = query.sort as string | string[] | undefined
  const limit = query.limit ? Number(query.limit) : undefined
  const offset = query.offset ? Number(query.offset) : undefined

  const sortArray = typeof sort === 'string'
    ? sort.split(',').filter(Boolean)
    : Array.isArray(sort)
      ? sort
      : ['-createdAt']

  const filter = search
    ? {
        _or: [
          { name: { _ilike: `%${search}%` } },
          { slug: { _ilike: `%${search}%` } },
        ],
      }
    : undefined

  const [categories, total] = await Promise.all([
    container.items.blogCategories.findMany({
      filter,
      sort: sortArray,
      limit,
      offset,
    }),
    container.items.blogCategories.count(filter),
  ])

  return { categories, total }
})
