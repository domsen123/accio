/**
 * Shared HTTP plumbing for Todo route handlers (T-2.4).
 *
 * Maps Zod validation failures and the Todo-specific business errors raised
 * by the service layer to stable HTTP status + error code pairs (ADR-012:
 * server returns codes, the client translates).
 */
import type { H3Event } from 'h3'
import type { ZodIssue, ZodSchema } from 'zod'
import { z } from 'zod'
import {
  TodoCannotPurgeActiveError,
  TodoKbLinkNotFoundError,
  TodoNotFoundError,
  TodoParentNotFoundError,
  TodoSubtaskDepthExceededError,
} from './types'

/**
 * Throw an h3 error shaped to look like the rest of our server. We pack the
 * stable error code in `statusMessage`; richer payloads (Zod issues) ride
 * along in `data`.
 */
export const todoThrow = (
  statusCode: number,
  code: string,
  data?: Record<string, unknown>,
): never => {
  throw createError({ statusCode, statusMessage: code, data })
}

export const todoValidate = <T>(schema: ZodSchema<T>, value: unknown): T => {
  const result = schema.safeParse(value)
  if (!result.success) {
    const issues: ZodIssue[] = result.error.issues
    todoThrow(400, 'validation.failed', {
      issues: issues.map(i => ({
        path: i.path,
        code: i.code,
        message: i.message,
      })),
    })
  }
  return (result as { success: true, data: T }).data
}

export const readTodoBody = async <T>(event: H3Event, schema: ZodSchema<T>): Promise<T> => {
  const body = await readBody(event)
  return todoValidate(schema, body ?? {})
}

export const readTodoQuery = <T>(event: H3Event, schema: ZodSchema<T>): T => {
  return todoValidate(schema, getQuery(event))
}

/**
 * Map service-layer errors into the API error vocabulary. Anything we don't
 * recognise is rethrown unchanged so the upstream handler can surface it.
 */
export const mapTodoError = (err: unknown): never => {
  if (err instanceof TodoNotFoundError)
    todoThrow(404, 'todo.not_found', { todoId: err.todoId })
  if (err instanceof TodoSubtaskDepthExceededError) {
    todoThrow(409, 'todo.subtask.depth_exceeded', {
      parentTodoId: err.parentTodoId,
      attemptedDepth: err.attemptedDepth,
      maxDepth: err.maxDepth,
    })
  }
  if (err instanceof TodoParentNotFoundError)
    todoThrow(404, 'todo.parent.not_found', { parentTodoId: err.parentTodoId })
  if (err instanceof TodoKbLinkNotFoundError)
    todoThrow(404, 'todo.kb_link.not_found', { entryId: err.entryId })
  if (err instanceof TodoCannotPurgeActiveError)
    todoThrow(409, 'todo.purge.active', { todoId: err.todoId })
  throw err
}

export const runTodoServiceCall = async <T>(fn: () => Promise<T> | T): Promise<T> => {
  try {
    return await fn()
  }
  catch (err) {
    mapTodoError(err)
    // unreachable; mapTodoError either throws or rethrows.
    throw err
  }
}

export const getRequiredParam = (event: H3Event, name: string, code: string): string => {
  const value = getRouterParam(event, name)?.trim()
  if (!value) {
    todoThrow(400, code)
  }
  return value as string
}

// Re-export for convenience.
export { z }
