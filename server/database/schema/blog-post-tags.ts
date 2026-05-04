import { pgTable, text, timestamp, unique } from 'drizzle-orm/pg-core'
import { blogPosts } from './blog-posts'
import { blogTags } from './blog-tags'

export const blogPostTags = pgTable('blog_post_tags', {
  id: text('id').primaryKey(), // ULID
  postId: text('post_id').notNull().references(() => blogPosts.id, { onDelete: 'cascade' }),
  tagId: text('tag_id').notNull().references(() => blogTags.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, table => [
  unique('blog_post_tags_post_tag_unique').on(table.postId, table.tagId),
])

export type BlogPostTag = typeof blogPostTags.$inferSelect
export type NewBlogPostTag = typeof blogPostTags.$inferInsert
