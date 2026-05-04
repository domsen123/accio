import { pgTable, real, text, timestamp } from 'drizzle-orm/pg-core'
import { files } from './files'

export const fileMetadata = pgTable('file_metadata', {
  id: text('id').primaryKey(), // ULID
  fileId: text('file_id').notNull().unique().references(() => files.id, { onDelete: 'cascade' }),
  alt: text('alt'),
  title: text('title'),
  description: text('description'),
  focusX: real('focus_x').notNull().default(0.5),
  focusY: real('focus_y').notNull().default(0.5),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export type FileMetadataRecord = typeof fileMetadata.$inferSelect
export type NewFileMetadataRecord = typeof fileMetadata.$inferInsert
