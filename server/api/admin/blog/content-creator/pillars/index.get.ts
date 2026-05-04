import { requireSuperAdmin } from '~~/server/features/rbac/rbac.guard'
import { container } from '~~/server/utils/container'

export default defineEventHandler(async (event) => {
  await requireSuperAdmin(event)

  const query = getQuery(event)
  const status = query.status as string | undefined
  const sort = query.sort as string | string[] | undefined

  const sortArray = typeof sort === 'string'
    ? sort.split(',').filter(Boolean)
    : Array.isArray(sort)
      ? sort
      : ['-createdAt']

  const filter: Record<string, unknown> = {}
  if (status) {
    filter.status = { _eq: status }
  }

  const [pillars, total] = await Promise.all([
    container.items.contentCreatorPillars.findMany({ filter, sort: sortArray }),
    container.items.contentCreatorPillars.count(filter),
  ])

  // Batch-fetch categories
  const categoryIds = [...new Set(pillars.map(p => p.categoryId).filter(Boolean))] as string[]
  const categories = categoryIds.length > 0
    ? await container.items.blogCategories.findMany({ filter: { id: { _in: categoryIds } } })
    : []
  const categoriesMap = new Map(categories.map(c => [c.id, { id: c.id, name: c.name, slug: c.slug }]))

  // Batch-fetch cluster counts
  const pillarIds = pillars.map(p => p.id)
  const clusters = pillarIds.length > 0
    ? await container.items.contentCreatorClusters.findMany({ filter: { pillarId: { _in: pillarIds } } })
    : []

  const clusterCountMap = new Map<string, number>()
  for (const c of clusters) {
    clusterCountMap.set(c.pillarId, (clusterCountMap.get(c.pillarId) ?? 0) + 1)
  }

  const enrichedPillars = pillars.map(p => ({
    ...p,
    category: p.categoryId ? categoriesMap.get(p.categoryId) ?? null : null,
    clusterCount: clusterCountMap.get(p.id) ?? 0,
  }))

  return { pillars: enrichedPillars, total }
})
