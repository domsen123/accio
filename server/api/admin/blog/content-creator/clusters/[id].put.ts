import * as z from 'zod'
import { requireSuperAdmin } from '~~/server/features/rbac/rbac.guard'
import { container } from '~~/server/utils/container'

const schema = z.object({
  title: z.string().trim().min(1).max(300).optional(),
  slug: z.string().trim().min(1).max(300).optional(),
  description: z.string().trim().transform(v => v || null).nullable().optional(),
  keywords: z.string().trim().transform(v => v || null).nullable().optional(),
  status: z.enum(['idea', 'approved', 'queued', 'generating', 'generated', 'failed']).optional(),
  priority: z.number().int().optional(),
  scheduledFor: z.string().datetime().nullable().optional(),
})

export default defineEventHandler(async (event) => {
  await requireSuperAdmin(event)

  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Cluster ID is required' })
  }

  const existing = await container.items.contentCreatorClusters.findOne({ id: { _eq: id } })
  if (!existing) {
    throw createError({ statusCode: 404, statusMessage: 'Cluster not found' })
  }

  const body = await readBody(event)
  const data = schema.parse(body)

  const updateData: Record<string, unknown> = { updatedAt: new Date() }

  if (data.title !== undefined)
    updateData.title = data.title
  if (data.slug !== undefined)
    updateData.slug = data.slug
  if (data.description !== undefined)
    updateData.description = data.description
  if (data.keywords !== undefined)
    updateData.keywords = data.keywords
  if (data.status !== undefined)
    updateData.status = data.status
  if (data.priority !== undefined)
    updateData.priority = data.priority
  if (data.scheduledFor !== undefined)
    updateData.scheduledFor = data.scheduledFor ? new Date(data.scheduledFor) : null

  const cluster = await container.items.contentCreatorClusters.update(id, updateData)

  return { cluster }
})
