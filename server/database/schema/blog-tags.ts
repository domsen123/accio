import { pgTable, text, timestamp } from 'drizzle-orm/pg-core'

export const blogTags = pgTable('blog_tags', {
  id: text('id').primaryKey(), // ULID
  name: text('name').notNull().unique(),
  slug: text('slug').notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export type BlogTag = typeof blogTags.$inferSelect
export type NewBlogTag = typeof blogTags.$inferInsert
