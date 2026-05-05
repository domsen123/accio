// MCP read tool: todo_get.
//
// Refs: DESIGN-TOOLS §Read tools, T-3.3.
//
// Single-row lookup with subtasks and linked KB entries hydrated. Throws
// `McpToolNotFoundEntityError` for an unknown id (or a row in a different
// workspace, which is indistinguishable from "not found" by design — REQ-WS-2).

import type { TodoService } from '../../todo/service'
import type { TodoPriority } from '../../todo/types'
import type { Tool } from '../mcp-server'
import { z } from 'zod'
import { McpToolNotFoundEntityError } from '../errors'

const TOOL_NAME = 'todo_get'

export const todoGetInputSchema = z.object({
  id: z.string().trim().min(1, 'id must not be empty'),
})

export type TodoGetInput = z.infer<typeof todoGetInputSchema>

export interface TodoSubtaskSummary {
  id: string
  title: string
  priority: TodoPriority
  due_at: string | null
  completed_at: string | null
}

export interface TodoLinkedKbSummary {
  id: string
  slug: string
  title: string
}

export interface TodoGetOutput {
  id: string
  parent_todo_id: string | null
  title: string
  description_md: string | null
  priority: TodoPriority
  due_at: string | null
  completed_at: string | null
  created_at: string
  updated_at: string
  tags: { id: string, name: string }[]
  linked_kb_entries: TodoLinkedKbSummary[]
  subtasks: TodoSubtaskSummary[]
  subtask_count: number
}

export interface CreateTodoGetToolDeps {
  todoService: TodoService
}

export const createTodoGetTool = (
  deps: CreateTodoGetToolDeps,
): Tool<TodoGetInput, TodoGetOutput> => ({
  name: TOOL_NAME,
  description: 'Fetch a single todo by id, including its tags, linked KB entries, and immediate subtasks.',
  schema: todoGetInputSchema as unknown as z.ZodType<TodoGetInput>,
  class: 'auto',
  mode: 'read',
  handler: async (input, ctx) => {
    const { todoService } = deps

    const todo = await todoService.findById({
      organisationId: ctx.organisationId,
      id: input.id,
    })
    if (!todo)
      throw new McpToolNotFoundEntityError(TOOL_NAME, 'todo', input.id)

    // Subtasks: direct children only (depth +1). `list` with `parentTodoId`
    // returns the immediate children, sorted by created_at desc by default.
    const children = await todoService.list({
      organisationId: ctx.organisationId,
      parentTodoId: todo.id,
    })

    return {
      id: todo.id,
      parent_todo_id: todo.parentTodoId,
      title: todo.title,
      description_md: todo.descriptionMd,
      priority: todo.priority as TodoPriority,
      due_at: todo.dueAt ? todo.dueAt.toISOString() : null,
      completed_at: todo.completedAt ? todo.completedAt.toISOString() : null,
      created_at: todo.createdAt.toISOString(),
      updated_at: todo.updatedAt.toISOString(),
      tags: todo.tags.map(t => ({ id: t.id, name: t.name })),
      linked_kb_entries: todo.kbEntries.map(e => ({ id: e.id, slug: e.slug, title: e.title })),
      subtasks: children.map(c => ({
        id: c.id,
        title: c.title,
        priority: c.priority as TodoPriority,
        due_at: c.dueAt ? c.dueAt.toISOString() : null,
        completed_at: c.completedAt ? c.completedAt.toISOString() : null,
      })),
      subtask_count: todo.subtaskCount,
    }
  },
})
