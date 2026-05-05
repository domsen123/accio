// MCP write tool: todo_update.
//
// Refs: DESIGN-TOOLS §Write Todos. Class is `auto` for non-destructive fields
// (the destructive operations — soft-delete — live in their own tool).
//
// Partial update of `{title, description_md, priority, due_at, parent_todo_id,
// tags}`. Resolves the todo within the caller's workspace before delegating to
// `todoService.update`, which owns tag rewrite + parent-depth validation.

import type { TodoService } from '../../todo/service'
import type { TodoPriority } from '../../todo/types'
import type { Tool } from '../mcp-server'
import { z } from 'zod'
import { TODO_PRIORITIES } from '../../todo/types'
import { resolveLiveTodo } from './todo-resolve'

const TOOL_NAME = 'todo_update'

export const todoUpdateInputSchema = z.object({
  id: z.string().trim().min(1, 'id must not be empty'),
  title: z.string().trim().min(1).optional(),
  description_md: z.string().nullable().optional(),
  priority: z.enum(TODO_PRIORITIES as unknown as [string, ...string[]]).optional(),
  due_at: z.string().trim().min(1).nullable().optional(),
  parent_todo_id: z.string().trim().min(1).nullable().optional(),
  tags: z.array(z.string().trim().min(1)).max(20).optional(),
}).refine(
  v => v.title !== undefined
    || v.description_md !== undefined
    || v.priority !== undefined
    || v.due_at !== undefined
    || v.parent_todo_id !== undefined
    || v.tags !== undefined,
  { message: 'At least one field must be supplied' },
)

export type TodoUpdateInput = z.infer<typeof todoUpdateInputSchema>

export interface TodoUpdateOutput {
  id: string
  title: string
  priority: TodoPriority
  due_at: string | null
  parent_todo_id: string | null
}

export interface CreateTodoUpdateToolDeps {
  todoService: TodoService
}

export const createTodoUpdateTool = (
  deps: CreateTodoUpdateToolDeps,
): Tool<TodoUpdateInput, TodoUpdateOutput> => ({
  name: TOOL_NAME,
  description: 'Update non-destructive fields on a todo (title, description, priority, due_at, parent, tags).',
  schema: todoUpdateInputSchema as unknown as z.ZodType<TodoUpdateInput>,
  class: 'auto',
  mode: 'write',
  handler: async (input, ctx) => {
    const { todoService } = deps

    await resolveLiveTodo({
      todoService,
      organisationId: ctx.organisationId,
      toolName: TOOL_NAME,
      id: input.id,
    })

    let dueAt: Date | null | undefined
    if (input.due_at === null) {
      dueAt = null
    }
    else if (input.due_at !== undefined) {
      const parsed = new Date(input.due_at)
      if (Number.isNaN(parsed.getTime()))
        throw new Error(`${TOOL_NAME}: due_at is not a valid ISO date string`)
      dueAt = parsed
    }

    const row = await todoService.update(input.id, {
      title: input.title,
      description: input.description_md,
      priority: input.priority as TodoPriority | undefined,
      dueAt,
      parentTodoId: input.parent_todo_id,
      tagNames: input.tags,
    })

    return {
      id: row.id,
      title: row.title,
      priority: row.priority as TodoPriority,
      due_at: row.dueAt ? row.dueAt.toISOString() : null,
      parent_todo_id: row.parentTodoId,
    }
  },
})
