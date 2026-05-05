/**
 * Zod schemas (v4) for the KB API surface (T-1.7).
 *
 * Co-located here so multiple route files share the same enum tuples + input
 * shapes without drift. Enum tuples are sourced from `./types` which mirrors
 * the pgEnum value sets in `server/database/schema/kb-entries.ts`.
 */
import { z } from 'zod'
import {
  KB_ENTRY_AUTHOR_TYPES,
  KB_ENTRY_SOURCE_TYPES,
  KB_ENTRY_STATUSES,
} from './types'

const TITLE_MAX = 200
const BODY_MAX = 200_000
const SOURCE_REF_MAX = 500
const AUTHOR_NAME_MAX = 200
const TAG_NAME_MAX = 50
const CATEGORY_NAME_MAX = 100
const SEARCH_MAX = 200

export const kbEntryStatusSchema = z.enum(KB_ENTRY_STATUSES as unknown as [string, ...string[]])
export const kbEntryAuthorTypeSchema = z.enum(KB_ENTRY_AUTHOR_TYPES as unknown as [string, ...string[]])
export const kbEntrySourceTypeSchema = z.enum(KB_ENTRY_SOURCE_TYPES as unknown as [string, ...string[]])

const tagNameSchema = z.string().trim().min(1).max(TAG_NAME_MAX)

export const createKbEntrySchema = z.object({
  title: z.string().trim().min(1).max(TITLE_MAX),
  body: z.string().max(BODY_MAX).optional().default(''),
  categoryId: z.string().trim().min(1).nullable().optional(),
  tagNames: z.array(tagNameSchema).max(50).optional(),
  status: kbEntryStatusSchema.optional(),
  authorType: kbEntryAuthorTypeSchema.optional(),
  authorName: z.string().trim().max(AUTHOR_NAME_MAX).optional(),
  sourceType: kbEntrySourceTypeSchema.optional(),
  sourceRef: z.string().trim().max(SOURCE_REF_MAX).nullable().optional(),
})

export const updateKbEntrySchema = z.object({
  title: z.string().trim().min(1).max(TITLE_MAX).optional(),
  body: z.string().max(BODY_MAX).optional(),
  categoryId: z.string().trim().min(1).nullable().optional(),
  tagNames: z.array(tagNameSchema).max(50).optional(),
  status: kbEntryStatusSchema.optional(),
  authorType: kbEntryAuthorTypeSchema.optional(),
  authorName: z.string().trim().max(AUTHOR_NAME_MAX).optional(),
  sourceType: kbEntrySourceTypeSchema.optional(),
  sourceRef: z.string().trim().max(SOURCE_REF_MAX).nullable().optional(),
})

export const replaceTagsSchema = z.object({
  tagNames: z.array(tagNameSchema).max(50),
})

export const setStatusSchema = z.object({
  status: kbEntryStatusSchema,
})

const truthy = new Set(['1', 'true', 'yes', 'on'])

export const listKbEntriesQuerySchema = z.object({
  search: z.string().trim().max(SEARCH_MAX).optional(),
  status: z.union([kbEntryStatusSchema, z.array(kbEntryStatusSchema)]).optional(),
  categoryId: z.string().trim().min(1).optional(),
  /**
   * When truthy AND `categoryId` is set, expand the filter to the selected
   * category and its descendants (REQ-KB-3 / T-1.11). Default false to
   * preserve existing call-site semantics.
   */
  includeDescendantCategories: z.preprocess(v => typeof v === 'string' ? truthy.has(v.toLowerCase()) : v, z.boolean().optional()),
  tagId: z.string().trim().min(1).optional(),
  authorType: kbEntryAuthorTypeSchema.optional(),
  sourceType: kbEntrySourceTypeSchema.optional(),
  includeArchived: z.preprocess(v => typeof v === 'string' ? truthy.has(v.toLowerCase()) : v, z.boolean().optional()),
  includeDeleted: z.preprocess(v => typeof v === 'string' ? truthy.has(v.toLowerCase()) : v, z.boolean().optional()),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  offset: z.coerce.number().int().min(0).optional(),
  sort: z.union([z.string().trim(), z.array(z.string().trim())]).optional(),
})

export const paginationQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional(),
  offset: z.coerce.number().int().min(0).optional(),
})

export const createKbCategorySchema = z.object({
  name: z.string().trim().min(1).max(CATEGORY_NAME_MAX),
  parentId: z.string().trim().min(1).nullable().optional(),
})

export const updateKbCategorySchema = z.object({
  name: z.string().trim().min(1).max(CATEGORY_NAME_MAX).optional(),
  parentId: z.string().trim().min(1).nullable().optional(),
})

export const createKbTagSchema = z.object({
  name: tagNameSchema,
})
