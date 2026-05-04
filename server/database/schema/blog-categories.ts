import { pgTable, text, timestamp } from 'drizzle-orm/pg-core'

export const blogCategories = pgTable('blog_categories', {
  id: text('id').primaryKey(), // ULID
  name: text('name').notNull().unique(),
  slug: text('slug').notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export type BlogCategory = typeof blogCategories.$inferSelect
export type NewBlogCategory = typeof blogCategories.$inferInsert
