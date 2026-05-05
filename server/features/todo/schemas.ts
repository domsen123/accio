/**
 * Zod schemas (v4) for the Todo API surface (T-2.4).
 *
 * Co-located here so multiple route files share the same enum tuples + input
 * shapes without drift. The priority enum tuple is sourced from `./types`
 * which mirrors the `todo_priority` pgEnum in `server/database/schema/todos.ts`.
 */
import { z } from 'zod'
import { TODO_PRIORITIES } from './types'

const TITLE_MAX = 500
const DESCRIPTION_MAX = 200_000
const SEARCH_MAX = 200
const TAG_NAME_MAX = 50

export const todoPrioritySchema = z.enum(TODO_PRIORITIES as unknown as [string, ...string[]])

const tagNameSchema = z.string().trim().min(1).max(TAG_NAME_MAX)

const truthy = new Set(['1', 'true', 'yes', 'on'])
const falsy = new Set(['0', 'false', 'no', 'off'])

const booleanQuery = z.preprocess((v) => {
  if (typeof v !== 'string')
    return v
  const lc = v.toLowerCase()
  if (truthy.has(lc))
    return true
  if (falsy.has(lc))
    return false
  return v
}, z.boolean().optional())

const dateQuery = z.preprocess((v) => {
  if (typeof v !== 'string' || v.trim().length === 0)
    return undefined
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? v : d
}, z.date().optional())

const dateBody = z.preprocess((v) => {
  if (v === null || v === undefined)
    return v
  if (v instanceof Date)
    return v
  if (typeof v === 'string' && v.trim().length > 0) {
    const d = new Date(v)
    return Number.isNaN(d.getTime()) ? v : d
  }
  return v
}, z.date().nullable().optional())

export const createTodoSchema = z.object({
  title: z.string().trim().min(1).max(TITLE_MAX),
  description: z.string().max(DESCRIPTION_MAX).nullable().optional(),
  priority: todoPrioritySchema.optional(),
  dueAt: dateBody,
  parentTodoId: z.string().trim().min(1).nullable().optional(),
  tagNames: z.array(tagNameSchema).max(50).optional(),
  kbEntryIds: z.array(z.string().trim().min(1)).max(50).optional(),
})

export const updateTodoSchema = z.object({
  title: z.string().trim().min(1).max(TITLE_MAX).optional(),
  description: z.string().max(DESCRIPTION_MAX).nullable().optional(),
  priority: todoPrioritySchema.optional(),
  dueAt: dateBody,
  parentTodoId: z.string().trim().min(1).nullable().optional(),
  tagNames: z.array(tagNameSchema).max(50).optional(),
  kbEntryIds: z.array(z.string().trim().min(1)).max(50).optional(),
})

export const replaceTodoTagsSchema = z.object({
  tagNames: z.array(tagNameSchema).max(50),
})

export const replaceTodoKbLinksSchema = z.object({
  kbEntryIds: z.array(z.string().trim().min(1)).max(50),
})

export const addTodoKbLinkSchema = z.object({
  entryId: z.string().trim().min(1),
})

export const addTodoTagSchema = z.object({
  tagId: z.string().trim().min(1),
})

export const listTodosQuerySchema = z.object({
  search: z.string().trim().max(SEARCH_MAX).optional(),
  completed: booleanQuery,
  priority: todoPrioritySchema.optional(),
  tagId: z.string().trim().min(1).optional(),
  kbEntryId: z.string().trim().min(1).optional(),
  parentTodoId: z.string().trim().min(1).optional(),
  /** Pass `?topLevel=1` to filter to top-level todos (`parent_todo_id IS NULL`). */
  topLevel: booleanQuery,
  dueBefore: dateQuery,
  dueAfter: dateQuery,
  includeDeleted: booleanQuery,
  limit: z.coerce.number().int().min(1).max(200).optional(),
  offset: z.coerce.number().int().min(0).optional(),
  sort: z.union([z.string().trim(), z.array(z.string().trim())]).optional(),
})

export const todoViewQuerySchema = z.object({
  search: z.string().trim().max(SEARCH_MAX).optional(),
  priority: todoPrioritySchema.optional(),
  tagId: z.string().trim().min(1).optional(),
  kbEntryId: z.string().trim().min(1).optional(),
  parentTodoId: z.string().trim().min(1).optional(),
  topLevel: booleanQuery,
  limit: z.coerce.number().int().min(1).max(200).optional(),
  offset: z.coerce.number().int().min(0).optional(),
})

export const upcomingTodoQuerySchema = todoViewQuerySchema.extend({
  withinDays: z.coerce.number().int().min(1).max(365).optional(),
})
