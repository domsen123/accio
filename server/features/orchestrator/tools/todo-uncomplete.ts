// MCP write tool: todo_uncomplete.
//
// Refs: DESIGN-TOOLS §Write Todos. Class is `auto`. Idempotent inverse of
// `todo_complete` — clearing `completed_at` on an already-active todo is a
// no-op.

import type { TodoService } from '../../todo/service'
import type { Tool } from '../mcp-server'
import { z } from 'zod'
import { resolveLiveTodo } from './todo-resolve'

const TOOL_NAME = 'todo_uncomplete'

export const todoUncompleteInputSchema = z.object({
  id: z.string().trim().min(1, 'id must not be empty'),
})

export type TodoUncompleteInput = z.infer<typeof todoUncompleteInputSchema>

export interface TodoUncompleteOutput {
  id: string
}

export interface CreateTodoUncompleteToolDeps {
  todoService: TodoService
}

export const createTodoUncompleteTool = (
  deps: CreateTodoUncompleteToolDeps,
): Tool<TodoUncompleteInput, TodoUncompleteOutput> => ({
  name: TOOL_NAME,
  description: 'Clear completed_at on a todo, returning it to the active set. Idempotent.',
  schema: todoUncompleteInputSchema as unknown as z.ZodType<TodoUncompleteInput>,
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

    const row = await todoService.uncomplete(input.id)
    return { id: row.id }
  },
})
