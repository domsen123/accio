import * as z from 'zod'
import { requireSuperAdmin } from '~~/server/features/rbac/rbac.guard'
import { container } from '~~/server/utils/container'

const schema = z.object({
  title: z.string().trim().min(1).max(200),
  slug: z.string().trim().min(1).max(200).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  teaser: z.string().trim().max(500).transform(v => v || null).nullable().optional(),
  content: z.string().trim().min(1),
  published: z.boolean().default(false),
  publishedAt: z.string().datetime().nullable().optional(),
  categoryId: z.string().nullable().optional(),
  tagIds: z.array(z.string()).default([]),
})

export default defineEventHandler(async (event) => {
  await requireSuperAdmin(event)

  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Post ID is required' })
  }

  const body = await readBody(event)
  const data = schema.parse(body)

  const existing = await container.items.blogPosts.findOne({ id: { _eq: id } })
  if (!existing) {
    throw createError({ statusCode: 404, statusMessage: 'Post not found' })
  }

  const slugExists = await container.items.blogPosts.findOne({
    slug: { _eq: data.slug },
    id: { _neq: id },
  })
  if (slugExists) {
    throw createError({ statusCode: 409, statusMessage: 'A post with this slug already exists' })
  }

  // Determine publishedAt based on publish state and explicit value
  let publishedAt: Date | null = existing.publishedAt
  if (!data.published) {
    publishedAt = null
  }
  else if (data.publishedAt !== undefined) {
    publishedAt = data.publishedAt ? new Date(data.publishedAt) : new Date()
  }
  else if (!existing.published) {
    publishedAt = new Date()
  }

  const post = await container.items.blogPosts.update(id, {
    title: data.title,
    slug: data.slug,
    teaser: data.teaser ?? null,
    content: data.content,
    published: data.published,
    publishedAt,
    categoryId: data.categoryId ?? null,
  })

  // Delete + reinsert junction rows for tags
  const existingPostTags = await container.items.blogPostTags.findMany({
    filter: { postId: { _eq: id } },
  })
  if (existingPostTags.length > 0) {
    await container.items.blogPostTags.deleteMany(existingPostTags.map(pt => pt.id))
  }
  if (data.tagIds.length > 0) {
    await container.items.blogPostTags.createMany(
      data.tagIds.map(tagId => ({ postId: id, tagId })),
    )
  }

  return { post }
})
