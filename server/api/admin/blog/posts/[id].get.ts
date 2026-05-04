import { requireSuperAdmin } from '~~/server/features/rbac/rbac.guard'
import { container } from '~~/server/utils/container'

export default defineEventHandler(async (event) => {
  await requireSuperAdmin(event)

  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Post ID is required' })
  }

  const post = await container.items.blogPosts.findOne({ id: { _eq: id } })
  if (!post) {
    throw createError({ statusCode: 404, statusMessage: 'Post not found' })
  }

  // Fetch author, category, and tags
  const [author, category, postTags] = await Promise.all([
    post.authorId
      ? container.items.users.findOne({ id: { _eq: post.authorId } })
      : null,
    post.categoryId
      ? container.items.blogCategories.findOne({ id: { _eq: post.categoryId } })
      : null,
    container.items.blogPostTags.findMany({ filter: { postId: { _eq: id } } }),
  ])

  const tagIds = postTags.map(pt => pt.tagId)
  const tags = tagIds.length > 0
    ? await container.items.blogTags.findMany({ filter: { id: { _in: tagIds } } })
    : []

  return {
    post: {
      ...post,
      author: author ? { id: author.id, name: author.name, email: author.email } : null,
      category: category ? { id: category.id, name: category.name, slug: category.slug } : null,
      tags: tags.map(t => ({ id: t.id, name: t.name, slug: t.slug })),
    },
  }
})
