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
  const user = event.context.user!

  const body = await readBody(event)
  const data = schema.parse(body)

  const slugExists = await container.items.blogPosts.findOne({ slug: { _eq: data.slug } })
  if (slugExists) {
    throw createError({ statusCode: 409, statusMessage: 'A post with this slug already exists' })
  }

  const post = await container.items.blogPosts.create({
    title: data.title,
    slug: data.slug,
    teaser: data.teaser ?? null,
    content: data.content,
    published: data.published,
    publishedAt: data.published ? (data.publishedAt ? new Date(data.publishedAt) : new Date()) : null,
    authorId: user.id,
    categoryId: data.categoryId ?? null,
  })

  // Create junction records for tags
  if (data.tagIds.length > 0) {
    await container.items.blogPostTags.createMany(
      data.tagIds.map(tagId => ({ postId: post.id, tagId })),
    )
  }

  return { post }
})
