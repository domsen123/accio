import { requireSuperAdmin } from '~~/server/features/rbac/rbac.guard'
import { container } from '~~/server/utils/container'

export default defineEventHandler(async (event) => {
  await requireSuperAdmin(event)

  const queue = await container.contentCreatorService.getProductionQueue()

  // Batch-fetch pillars for context
  const pillarIds = [...new Set(queue.map(c => c.pillarId))]
  const pillars = pillarIds.length > 0
    ? await container.items.contentCreatorPillars.findMany({ filter: { id: { _in: pillarIds } } })
    : []
  const pillarsMap = new Map(pillars.map(p => [p.id, { id: p.id, name: p.name, seedTopic: p.seedTopic }]))

  const enrichedQueue = queue.map(c => ({
    ...c,
    pillar: pillarsMap.get(c.pillarId) ?? null,
  }))

  return { queue: enrichedQueue }
})
