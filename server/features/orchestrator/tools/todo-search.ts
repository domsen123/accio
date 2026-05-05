// MCP read tool: todo_search.
//
// Refs: DESIGN-TOOLS §Read tools, T-3.3.
//
// Routes to one of `todoService.{list,listToday,listUpcoming,listOpen,listCompleted}`
// depending on the `view` input. Workspace scoping is via `ctx.organisationId`
// — never trust caller-supplied org ids. Tag names are resolved against the
// workspace's tag set; an unknown tag name short-circuits to zero results.

import type { Todo } from '../../../database/schema'
import type { KbEntryService, KbTagService } from '../../kb/service'
import type { TodoService } from '../../todo/service'
import type { TodoPriority } from '../../todo/types'
import type { Tool } from '../mcp-server'
import { z } from 'zod'
import { TODO_PRIORITIES } from '../../todo/types'

const TODO_VIEWS = ['today', 'upcoming', 'open', 'completed'] as const
type TodoView = (typeof TODO_VIEWS)[number]

const priorityEnum = z.enum(TODO_PRIORITIES as unknown as [string, ...string[]])
const viewEnum = z.enum(TODO_VIEWS as unknown as [string, ...string[]])

const MAX_LIMIT = 50
const DEFAULT_LIMIT = 20

export const todoSearchInputSchema = z.object({
  query: z.string().trim().min(1).optional(),
  view: viewEnum.optional(),
  priority: priorityEnum.optional(),
  tags: z.array(z.string().trim().min(1)).max(20).optional(),
  linked_to_kb: z.string().trim().min(1).optional(),
  limit: z.number().int().min(1).max(MAX_LIMIT).optional(),
})

export type TodoSearchInput = z.infer<typeof todoSearchInputSchema>

export interface TodoSearchResultItem {
  id: string
  title: string
  priority: TodoPriority
  due_at: string | null
  completed_at: string | null
  parent_todo_id: string | null
}

export interface TodoSearchOutput {
  results: TodoSearchResultItem[]
}

export interface CreateTodoSearchToolDeps {
  todoService: TodoService
  kbEntryService: KbEntryService
  kbTagService: KbTagService
}

const ULID_RE = /^[0-9A-HJKMNP-TV-Z]{26}$/i

const shapeRow = (row: Todo): TodoSearchResultItem => ({
  id: row.id,
  title: row.title,
  priority: row.priority as TodoPriority,
  due_at: row.dueAt ? row.dueAt.toISOString() : null,
  completed_at: row.completedAt ? row.completedAt.toISOString() : null,
  parent_todo_id: row.parentTodoId,
})

export const createTodoSearchTool = (
  deps: CreateTodoSearchToolDeps,
): Tool<TodoSearchInput, TodoSearchOutput> => ({
  name: 'todo_search',
  description: 'Search and filter todos. Supports canonical views (today/upcoming/open/completed), full-text query on title/description, priority, tags, and KB-link narrowing.',
  schema: todoSearchInputSchema as unknown as z.ZodType<TodoSearchInput>,
  class: 'auto',
  mode: 'read',
  handler: async (input, ctx) => {
    const { todoService, kbEntryService, kbTagService } = deps
    const limit = input.limit ?? DEFAULT_LIMIT

    // Resolve linked_to_kb (slug or id) → entry id. Unknown → zero results.
    let kbEntryId: string | undefined
    if (input.linked_to_kb) {
      let resolved: string | null = null
      if (ULID_RE.test(input.linked_to_kb)) {
        const byId = await kbEntryService.findById(input.linked_to_kb)
        if (byId && byId.organisationId === ctx.organisationId)
          resolved = byId.id
      }
      if (!resolved) {
        const bySlug = await kbEntryService.findBySlug({
          organisationId: ctx.organisationId,
          slug: input.linked_to_kb,
        })
        if (bySlug)
          resolved = bySlug.id
      }
      if (!resolved)
        return { results: [] }
      kbEntryId = resolved
    }

    // Resolve tag names → a single tag id. The underlying service exposes a
    // single-tag filter; for the MCP surface we accept multiple names and AND
    // them when more than one is supplied. Empty intersection → zero results.
    // We handle 1-tag fast path natively via `tagId`; for ≥2 tags we resolve
    // each separately and intersect the result id sets in JS.
    let tagIds: string[] | undefined
    if (input.tags && input.tags.length > 0) {
      const tags = await kbTagService.list({ organisationId: ctx.organisationId })
      const wanted = new Set(input.tags.map(t => t.trim().toLowerCase()))
      const matched = tags.filter(t => wanted.has(t.name.trim().toLowerCase()))
      if (matched.length !== wanted.size)
        return { results: [] }
      tagIds = matched.map(t => t.id)
    }

    const view = input.view as TodoView | undefined

    // Canonical views accept priority/tag/kb/search/limit but not the raw
    // `completed` / due-window inputs the generic `list` takes.
    const callView = async () => {
      const baseInput = {
        organisationId: ctx.organisationId,
        priority: input.priority as TodoPriority | undefined,
        tagId: tagIds && tagIds.length > 0 ? tagIds[0] : undefined,
        kbEntryId,
        search: input.query,
        limit,
      }
      switch (view) {
        case 'today':
          return todoService.listToday(baseInput)
        case 'upcoming':
          return todoService.listUpcoming(baseInput)
        case 'open':
          return todoService.listOpen(baseInput)
        case 'completed':
          return todoService.listCompleted(baseInput)
        case undefined:
          return todoService.list({
            organisationId: ctx.organisationId,
            priority: input.priority as TodoPriority | undefined,
            tagId: tagIds && tagIds.length > 0 ? tagIds[0] : undefined,
            kbEntryId,
            search: input.query,
            limit,
          })
      }
    }

    let rows = await callView()

    // Multi-tag AND: the underlying service exposes a single-tag filter, so
    // for ≥2 we fetch each tag's todo-id set and intersect. For typical N
    // (1-3 tags) this stays cheap; the result is then re-limited.
    if (tagIds && tagIds.length > 1) {
      const sets = await Promise.all(tagIds.slice(1).map(tid =>
        todoService.list({
          organisationId: ctx.organisationId,
          tagId: tid,
        }).then(r => new Set(r.map(t => t.id))),
      ))
      rows = rows.filter(r => sets.every(s => s.has(r.id))).slice(0, limit)
    }

    return { results: rows.map(shapeRow) }
  },
})
