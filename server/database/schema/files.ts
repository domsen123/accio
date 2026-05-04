import type { AnyPgColumn } from 'drizzle-orm/pg-core'
import { integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core'
import { users } from './users'

export const files = pgTable('files', {
  id: text('id').primaryKey(), // ULID
  filename: text('filename').notNull(),
  originalName: text('original_name').notNull(),
  mimeType: text('mime_type').notNull(),
  size: integer('size').notNull(),
  storagePath: text('storage_path').notNull(),
  storageProvider: text('storage_provider').notNull().default('local'),
  uploadedBy: text('uploaded_by').references(() => users.id, { onDelete: 'set null' }),
  entityType: text('entity_type'),
  entityId: text('entity_id'),
  parentId: text('parent_id').references((): AnyPgColumn => files.id, { onDelete: 'cascade' }),
  variant: text('variant'), // 'original' | 'sm' | 'md' | 'lg'
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export type FileRecord = typeof files.$inferSelect
export type NewFileRecord = typeof files.$inferInsert
