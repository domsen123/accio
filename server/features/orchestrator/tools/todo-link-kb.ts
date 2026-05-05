// MCP write tool: todo_link_kb.
//
// Refs: DESIGN-TOOLS §Write Todos. Class is `auto`. Idempotent — relinking
// an existing pair returns the same shape, doesn't error.
//
// Resolves `kb_slug_or_id` to a KB entry id within the caller's workspace
// (cross-workspace surfaces as not-found). Both the todo and the KB entry
// must live in `ctx.organisationId`.

import type { KbEntryService } from '../../kb/service'
import type { TodoService } from '../../todo/service'
import type { Tool } from '../mcp-server'
import { z } from 'zod'
import { resolveLiveKbEntry } from './kb-resolve-entry'
import { resolveLiveTodo } from './todo-resolve'

const TOOL_NAME = 'todo_link_kb'

export const todoLinkKbInputSchema = z.object({
  todo_id: z.string().trim().min(1, 'todo_id must not be empty'),
  kb_slug_or_id: z.string().trim().min(1, 'kb_slug_or_id must not be empty'),
})

export type TodoLinkKbInput = z.infer<typeof todoLinkKbInputSchema>

export interface TodoLinkKbOutput {
  todo_id: string
  kb_entry_id: string
}

export interface CreateTodoLinkKbToolDeps {
  todoService: TodoService
  kbEntryService: KbEntryService
}

export const createTodoLinkKbTool = (
  deps: CreateTodoLinkKbToolDeps,
): Tool<TodoLinkKbInput, TodoLinkKbOutput> => ({
  name: TOOL_NAME,
  description: 'Link a todo to a KB entry. Idempotent — re-linking an existing pair is a no-op.',
  schema: todoLinkKbInputSchema as unknown as z.ZodType<TodoLinkKbInput>,
  class: 'auto',
  mode: 'write',
  handler: async (input, ctx) => {
    const { todoService, kbEntryService } = deps

    const todo = await resolveLiveTodo({
      todoService,
      organisationId: ctx.organisationId,
      toolName: TOOL_NAME,
      id: input.todo_id,
    })
    const kbEntry = await resolveLiveKbEntry({
      kbEntryService,
      organisationId: ctx.organisationId,
      toolName: TOOL_NAME,
      slugOrId: input.kb_slug_or_id,
    })

    await todoService.linkKb({ todoId: todo.id, entryId: kbEntry.id })

    return {
      todo_id: todo.id,
      kb_entry_id: kbEntry.id,
    }
  },
})
