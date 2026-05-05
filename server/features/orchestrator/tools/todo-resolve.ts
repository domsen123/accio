// Shared helper: resolve a `todo id` input to a live todo within the caller's
// workspace. Used by every Todo write tool (T-3.5) so the workspace-scope +
// soft-delete check lives in one place. Mirrors `kb-resolve-entry.ts`.

import type { TodoService } from '../../todo/service'
import type { TodoWithRelations } from '../../todo/types'
import { McpToolNotFoundEntityError } from '../errors'

/**
 * Resolve a todo id to a live (non-soft-deleted) row in the caller's
 * workspace. Cross-workspace ids and soft-deleted rows surface as
 * `McpToolNotFoundEntityError` (which bubbles unchanged through `invoke`).
 *
 * Pass `includeDeleted: true` for tools that operate on the trashed surface
 * (currently none in T-3.5; reserved for the eventual `todo_restore`).
 */
export const resolveLiveTodo = async (params: {
  todoService: TodoService
  organisationId: string
  toolName: string
  id: string
  includeDeleted?: boolean
}): Promise<TodoWithRelations> => {
  const { todoService, organisationId, toolName, id, includeDeleted } = params
  const todo = await todoService.findById({ organisationId, id, includeDeleted })
  if (!todo)
    throw new McpToolNotFoundEntityError(toolName, 'todo', id)
  return todo
}
