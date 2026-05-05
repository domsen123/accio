// MCP write tool: todo_unlink_kb.
//
// Refs: DESIGN-TOOLS §Write Todos. Class is `auto`. Idempotent — silent no-op
// when the link doesn't exist (`removed: false`).

import type { KbEntryService } from '../../kb/service'
import type { TodoService } from '../../todo/service'
import type { Tool } from '../mcp-server'
import { z } from 'zod'
import { resolveLiveKbEntry } from './kb-resolve-entry'
import { resolveLiveTodo } from './todo-resolve'

const TOOL_NAME = 'todo_unlink_kb'

export const todoUnlinkKbInputSchema = z.object({
  todo_id: z.string().trim().min(1, 'todo_id must not be empty'),
  kb_slug_or_id: z.string().trim().min(1, 'kb_slug_or_id must not be empty'),
})

export type TodoUnlinkKbInput = z.infer<typeof todoUnlinkKbInputSchema>

export interface TodoUnlinkKbOutput {
  todo_id: string
  kb_entry_id: string
  removed: boolean
}

export interface CreateTodoUnlinkKbToolDeps {
  todoService: TodoService
  kbEntryService: KbEntryService
}

export const createTodoUnlinkKbTool = (
  deps: CreateTodoUnlinkKbToolDeps,
): Tool<TodoUnlinkKbInput, TodoUnlinkKbOutput> => ({
  name: TOOL_NAME,
  description: 'Remove a todo↔KB entry link. Idempotent — returns removed:false when the link did not exist.',
  schema: todoUnlinkKbInputSchema as unknown as z.ZodType<TodoUnlinkKbInput>,
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

    const wasLinked = todo.kbEntries.some(e => e.id === kbEntry.id)
    if (wasLinked)
      await todoService.unlinkKb({ todoId: todo.id, entryId: kbEntry.id })

    return {
      todo_id: todo.id,
      kb_entry_id: kbEntry.id,
      removed: wasLinked,
    }
  },
})
