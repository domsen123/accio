import { integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core'
import { blogPosts } from './blog-posts'
import { contentCreatorPillars } from './content-creator-pillars'

export const contentCreatorClusters = pgTable('content_creator_clusters', {
  id: text('id').primaryKey(), // ULID
  pillarId: text('pillar_id').notNull().references(() => contentCreatorPillars.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  slug: text('slug').notNull(),
  description: text('description'),
  keywords: text('keywords'), // Comma-separated
  status: text('status').notNull().default('idea'), // 'idea' | 'approved' | 'queued' | 'generating' | 'generated' | 'failed'
  blogPostId: text('blog_post_id').references(() => blogPosts.id, { onDelete: 'set null' }),
  priority: integer('priority').notNull().default(0),
  scheduledFor: timestamp('scheduled_for', { withTimezone: true }),
  generatedAt: timestamp('generated_at', { withTimezone: true }),
  errorMessage: text('error_message'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export type ContentCreatorCluster = typeof contentCreatorClusters.$inferSelect
export type NewContentCreatorCluster = typeof contentCreatorClusters.$inferInsert
