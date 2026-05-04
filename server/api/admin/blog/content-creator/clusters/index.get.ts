import { requireSuperAdmin } from '~~/server/features/rbac/rbac.guard'
import { container } from '~~/server/utils/container'

export default defineEventHandler(async (event) => {
  await requireSuperAdmin(event)

  const query = getQuery(event)
  const pillarId = query.pillarId as string | undefined
  const status = query.status as string | undefined
  const sort = query.sort as string | string[] | undefined
  const limit = query.limit ? Number(query.limit) : undefined
  const offset = query.offset ? Number(query.offset) : undefined

  const sortArray = typeof sort === 'string'
    ? sort.split(',').filter(Boolean)
    : Array.isArray(sort)
      ? sort
      : ['-createdAt']

  const filter: Record<string, unknown> = {}
  if (pillarId) {
    filter.pillarId = { _eq: pillarId }
  }
  if (status) {
    filter.status = { _eq: status }
  }

  const [clusters, total] = await Promise.all([
    container.items.contentCreatorClusters.findMany({ filter, sort: sortArray, limit, offset }),
    container.items.contentCreatorClusters.count(filter),
  ])

  // Batch-fetch pillars
  const pillarIds = [...new Set(clusters.map(c => c.pillarId))]
  const pillars = pillarIds.length > 0
    ? await container.items.contentCreatorPillars.findMany({ filter: { id: { _in: pillarIds } } })
    : []
  const pillarsMap = new Map(pillars.map(p => [p.id, { id: p.id, name: p.name, seedTopic: p.seedTopic }]))

  const enrichedClusters = clusters.map(c => ({
    ...c,
    pillar: pillarsMap.get(c.pillarId) ?? null,
  }))

  return { clusters: enrichedClusters, total }
})
