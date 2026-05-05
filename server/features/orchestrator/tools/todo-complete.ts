// MCP write tool: todo_complete.
//
// Refs: DESIGN-TOOLS §Write Todos. Class is `auto`. Idempotent — completing
// an already-completed todo returns the existing `completed_at` unchanged.

import type { TodoService } from '../../todo/service'
import type { Tool } from '../mcp-server'
import { z } from 'zod'
import { resolveLiveTodo } from './todo-resolve'

const TOOL_NAME = 'todo_complete'

export const todoCompleteInputSchema = z.object({
  id: z.string().trim().min(1, 'id must not be empty'),
})

export type TodoCompleteInput = z.infer<typeof todoCompleteInputSchema>

export interface TodoCompleteOutput {
  id: string
  completed_at: string
}

export interface CreateTodoCompleteToolDeps {
  todoService: TodoService
}

export const createTodoCompleteTool = (
  deps: CreateTodoCompleteToolDeps,
): Tool<TodoCompleteInput, TodoCompleteOutput> => ({
  name: TOOL_NAME,
  description: 'Mark a todo as completed (sets completed_at to now). Idempotent.',
  schema: todoCompleteInputSchema as unknown as z.ZodType<TodoCompleteInput>,
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

    const row = await todoService.complete(input.id)
    const completedAt = row.completedAt ?? new Date()

    return {
      id: row.id,
      completed_at: completedAt.toISOString(),
    }
  },
})
