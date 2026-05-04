import { boolean, pgTable, text, timestamp } from 'drizzle-orm/pg-core'
import { blogCategories } from './blog-categories'
import { users } from './users'

export const blogPosts = pgTable('blog_posts', {
  id: text('id').primaryKey(), // ULID
  title: text('title').notNull(),
  slug: text('slug').notNull().unique(),
  teaser: text('teaser'),
  content: text('content').notNull(),
  published: boolean('published').notNull().default(false),
  publishedAt: timestamp('published_at', { withTimezone: true }),
  authorId: text('author_id').references(() => users.id, { onDelete: 'set null' }),
  categoryId: text('category_id').references(() => blogCategories.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export type BlogPost = typeof blogPosts.$inferSelect
export type NewBlogPost = typeof blogPosts.$inferInsert
