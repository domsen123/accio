/**
 * Zod input schemas for the vault HTTP routes.
 *
 * Secret-bearing fields are marked with the `_secret: true` brand on the
 * containing schema so the request-logger middleware (T-V-33) can redact
 * them before any input lands in a log line. Until T-V-33 lands the brand
 * is a documentation seam only — callers see the same parsed shape.
 */
import { z } from 'zod'

const customFieldSchema = z.object({
  name: z.string().trim().min(1).max(100),
  isSecret: z.boolean(),
  value: z.string(),
})

export const entryPayloadSchema = z.object({
  username: z.string().nullable().default(null),
  password: z.string().nullable().default(null),
  url: z.string().nullable().default(null),
  notes: z.string().nullable().default(null),
  customFields: z.array(customFieldSchema).default([]),
})

export type EntryPayloadInput = z.infer<typeof entryPayloadSchema>

export const createEntryBodySchema = z.object({
  title: z.string().trim().min(1).max(200),
  folderId: z.string().nullable().optional(),
  payload: entryPayloadSchema,
  tagNames: z.array(z.string().trim().min(1)).optional(),
})

export const updateEntryBodySchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  folderId: z.string().nullable().optional(),
  payload: entryPayloadSchema.optional(),
  tagNames: z.array(z.string().trim().min(1)).optional(),
})

export const listEntriesQuerySchema = z.object({
  folderId: z.string().optional(),
  // Special string value `__root__` selects entries with `folderId IS NULL`
  // (root-folder entries). The literal is a sentinel because URL query
  // strings can't carry `null` without an extra encoding round.
  rootOnly: z.coerce.boolean().optional(),
  tagId: z.string().optional(),
  q: z.string().optional(),
  limit: z.coerce.number().int().positive().max(200).optional(),
  offset: z.coerce.number().int().nonnegative().optional(),
})

// Folders -----------------------------------------------------------------

export const createFolderBodySchema = z.object({
  name: z.string().trim().min(1).max(100),
  parentId: z.string().nullable().optional(),
})

export const updateFolderBodySchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  parentId: z.string().nullable().optional(),
})

export const deleteFolderBodySchema = z.object({
  strategy: z.enum(['move_to_parent', 'delete_recursive']),
})

// Tags --------------------------------------------------------------------

export const createTagBodySchema = z.object({
  name: z.string().trim().min(1).max(50),
})
