// MCP write tool: todo_soft_delete.
//
// Refs: DESIGN-TOOLS §Write Todos, REQ-ORCH-8 (no hard delete from
// orchestrator), ADR-009. Class is `confirm`.
//
// Sets `deleted_at`. Subtasks are NOT cascade-soft-deleted (mirrors the
// service's behaviour — children may remain meaningful). Hard-delete is
// only available via the Trash UI.

import type { TodoService } from '../../todo/service'
import type { Tool } from '../mcp-server'
import { z } from 'zod'
import { resolveLiveTodo } from './todo-resolve'

const TOOL_NAME = 'todo_soft_delete'

export const todoSoftDeleteInputSchema = z.object({
  id: z.string().trim().min(1, 'id must not be empty'),
})

export type TodoSoftDeleteInput = z.infer<typeof todoSoftDeleteInputSchema>

export interface TodoSoftDeleteOutput {
  id: string
  deleted_at: string
}

export interface CreateTodoSoftDeleteToolDeps {
  todoService: TodoService
}

export const createTodoSoftDeleteTool = (
  deps: CreateTodoSoftDeleteToolDeps,
): Tool<TodoSoftDeleteInput, TodoSoftDeleteOutput> => ({
  name: TOOL_NAME,
  description: 'Move a todo to the trash by setting deleted_at. Hard-delete is not exposed to the orchestrator. Requires user confirmation.',
  schema: todoSoftDeleteInputSchema as unknown as z.ZodType<TodoSoftDeleteInput>,
  class: 'confirm',
  mode: 'write',
  handler: async (input, ctx) => {
    const { todoService } = deps

    await resolveLiveTodo({
      todoService,
      organisationId: ctx.organisationId,
      toolName: TOOL_NAME,
      id: input.id,
    })

    const row = await todoService.softDelete(input.id)
    const deletedAt = row.deletedAt ?? new Date()

    return {
      id: row.id,
      deleted_at: deletedAt.toISOString(),
    }
  },
})
