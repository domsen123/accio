// MCP write tool: todo_create.
//
// Refs: DESIGN-TOOLS §Write Todos, REQ-TODO-1..2.
//
// Class is `auto`. Creates a todo and (optionally) attaches tags + initial KB
// links. KB links accept a mix of slugs and ids — slugs are resolved to ids
// via `kbEntryService` before delegating to `todoService.create`.

import type { KbEntryService } from '../../kb/service'
import type { TodoService } from '../../todo/service'
import type { TodoPriority } from '../../todo/types'
import type { Tool } from '../mcp-server'
import { z } from 'zod'
import { TODO_PRIORITIES } from '../../todo/types'
import { resolveLiveKbEntry } from './kb-resolve-entry'

const TOOL_NAME = 'todo_create'

export const todoCreateInputSchema = z.object({
  title: z.string().trim().min(1, 'title must not be empty'),
  description_md: z.string().optional(),
  priority: z.enum(TODO_PRIORITIES as unknown as [string, ...string[]]).optional(),
  due_at: z.string().trim().min(1).optional(),
  parent_todo_id: z.string().trim().min(1).optional(),
  tags: z.array(z.string().trim().min(1)).max(20).optional(),
  kb_links: z.array(z.string().trim().min(1)).max(20).optional(),
})

export type TodoCreateInput = z.infer<typeof todoCreateInputSchema>

export interface TodoCreateOutput {
  id: string
  title: string
  priority: TodoPriority
  due_at: string | null
  parent_todo_id: string | null
}

export interface CreateTodoCreateToolDeps {
  todoService: TodoService
  kbEntryService: KbEntryService
}

export const createTodoCreateTool = (
  deps: CreateTodoCreateToolDeps,
): Tool<TodoCreateInput, TodoCreateOutput> => ({
  name: TOOL_NAME,
  description: 'Create a new todo. Optionally attaches tags and links KB entries by slug or id.',
  schema: todoCreateInputSchema as unknown as z.ZodType<TodoCreateInput>,
  class: 'auto',
  mode: 'write',
  handler: async (input, ctx) => {
    const { todoService, kbEntryService } = deps

    // Resolve KB slugs/ids to ids in the caller's workspace before insertion.
    // The service validates ids against the workspace too, but we resolve
    // slugs here so the model can pass either form.
    let kbEntryIds: string[] | undefined
    if (input.kb_links && input.kb_links.length > 0) {
      const resolved = await Promise.all(
        input.kb_links.map(slugOrId =>
          resolveLiveKbEntry({
            kbEntryService,
            organisationId: ctx.organisationId,
            toolName: TOOL_NAME,
            slugOrId,
          }),
        ),
      )
      kbEntryIds = resolved.map(e => e.id)
    }

    let dueAt: Date | null | undefined
    if (input.due_at !== undefined) {
      const parsed = new Date(input.due_at)
      if (Number.isNaN(parsed.getTime()))
        throw new Error(`${TOOL_NAME}: due_at is not a valid ISO date string`)
      dueAt = parsed
    }

    const row = await todoService.create({
      organisationId: ctx.organisationId,
      title: input.title,
      description: input.description_md ?? null,
      priority: input.priority as TodoPriority | undefined,
      dueAt: dueAt ?? null,
      parentTodoId: input.parent_todo_id ?? null,
      tagNames: input.tags,
      kbEntryIds,
      createdBy: ctx.userId,
    })
    if (!row)
      throw new Error(`${TOOL_NAME}: service returned no row`)

    return {
      id: row.id,
      title: row.title,
      priority: row.priority as TodoPriority,
      due_at: row.dueAt ? row.dueAt.toISOString() : null,
      parent_todo_id: row.parentTodoId,
    }
  },
})
