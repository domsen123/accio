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
          { title: { _ilike: `%${search}%` } },
          { slug: { _ilike: `%${search}%` } },
        ],
      }
    : undefined

  const [posts, total] = await Promise.all([
    container.items.blogPosts.findMany({
      filter,
      sort: sortArray,
      limit,
      offset,
    }),
    container.items.blogPosts.count(filter),
  ])

  // Batch-fetch author names, categories, and tags for all posts
  const authorIds = [...new Set(posts.map(p => p.authorId).filter(Boolean))] as string[]
  const categoryIds = [...new Set(posts.map(p => p.categoryId).filter(Boolean))] as string[]
  const postIds = posts.map(p => p.id)

  const [authors, categories, postTags] = await Promise.all([
    authorIds.length > 0
      ? container.items.users.findMany({
          filter: { id: { _in: authorIds } },
          fields: ['id', 'name', 'email'],
        })
      : [],
    categoryIds.length > 0
      ? container.items.blogCategories.findMany({
          filter: { id: { _in: categoryIds } },
        })
      : [],
    postIds.length > 0
      ? container.items.blogPostTags.findMany({
          filter: { postId: { _in: postIds } },
        })
      : [],
  ])

  // Fetch tag details for all referenced tags
  const tagIds = [...new Set(postTags.map(pt => pt.tagId))]
  const tags = tagIds.length > 0
    ? await container.items.blogTags.findMany({
        filter: { id: { _in: tagIds } },
      })
    : []

  const authorsMap = new Map(authors.map(a => [a.id, { id: a.id, name: a.name, email: a.email }]))
  const categoriesMap = new Map(categories.map(c => [c.id, { id: c.id, name: c.name, slug: c.slug }]))
  const tagsMap = new Map(tags.map(t => [t.id, { id: t.id, name: t.name, slug: t.slug }]))

  const enrichedPosts = posts.map((post) => {
    const postTagIds = postTags.filter(pt => pt.postId === post.id).map(pt => pt.tagId)
    return {
      ...post,
      author: post.authorId ? authorsMap.get(post.authorId) ?? null : null,
      category: post.categoryId ? categoriesMap.get(post.categoryId) ?? null : null,
      tags: postTagIds.map(tid => tagsMap.get(tid)).filter(Boolean),
    }
  })

  return { posts: enrichedPosts, total }
})
