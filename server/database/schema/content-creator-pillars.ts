import { pgTable, text, timestamp } from 'drizzle-orm/pg-core'
import { blogCategories } from './blog-categories'

export const contentCreatorPillars = pgTable('content_creator_pillars', {
  id: text('id').primaryKey(), // ULID
  seedTopic: text('seed_topic').notNull(),
  name: text('name').notNull(),
  description: text('description'),
  categoryId: text('category_id').references(() => blogCategories.id, { onDelete: 'set null' }),
  status: text('status').notNull().default('pending'), // 'pending' | 'confirmed' | 'rejected'
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export type ContentCreatorPillar = typeof contentCreatorPillars.$inferSelect
export type NewContentCreatorPillar = typeof contentCreatorPillars.$inferInsert
