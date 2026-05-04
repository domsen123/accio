/**
 * Shared HTTP plumbing for KB route handlers (T-1.7).
 *
 * Maps Zod validation failures and the KB-specific business errors raised by
 * the service layer to stable HTTP status + error code pairs (ADR-012: server
 * returns codes, the client translates).
 */
import type { H3Event } from 'h3'
import type { ZodIssue, ZodSchema } from 'zod'
import { z } from 'zod'
import {
  KbCannotPurgeActiveError,
  KbInvalidStatusTransitionError,
} from './types'

/**
 * Throw an h3 error shaped to look like the rest of our server. We pack the
 * stable error code in `statusMessage`; richer payloads (Zod issues) ride
 * along in `data`.
 */
export const kbThrow = (
  statusCode: number,
  code: string,
  data?: Record<string, unknown>,
): never => {
  throw createError({ statusCode, statusMessage: code, data })
}

export const kbValidate = <T>(schema: ZodSchema<T>, value: unknown): T => {
  const result = schema.safeParse(value)
  if (!result.success) {
    const issues: ZodIssue[] = result.error.issues
    kbThrow(400, 'validation.failed', {
      issues: issues.map(i => ({
        path: i.path,
        code: i.code,
        message: i.message,
      })),
    })
  }
  return (result as { success: true, data: T }).data
}

export const readKbBody = async <T>(event: H3Event, schema: ZodSchema<T>): Promise<T> => {
  const body = await readBody(event)
  return kbValidate(schema, body ?? {})
}

export const readKbQuery = <T>(event: H3Event, schema: ZodSchema<T>): T => {
  return kbValidate(schema, getQuery(event))
}

/**
 * Map service-layer errors into the API error vocabulary. Anything we don't
 * recognise is rethrown unchanged so the upstream handler can surface it.
 */
export const mapKbError = (err: unknown): never => {
  if (err instanceof KbInvalidStatusTransitionError) {
    kbThrow(409, 'kb.status.invalid_transition', { from: err.from, to: err.to })
  }
  if (err instanceof KbCannotPurgeActiveError) {
    kbThrow(409, 'kb.purge.entry_active', { entryId: err.entryId })
  }
  throw err
}

export const runKbServiceCall = async <T>(fn: () => Promise<T> | T): Promise<T> => {
  try {
    return await fn()
  }
  catch (err) {
    mapKbError(err)
    // unreachable; mapKbError either throws or rethrows.
    throw err
  }
}

export const getRequiredParam = (event: H3Event, name: string, code: string): string => {
  const value = getRouterParam(event, name)?.trim()
  if (!value) {
    kbThrow(400, code)
  }
  return value as string
}

// Re-export for convenience so route files can `import { z } from '../../features/kb/api-utils'`.
export { z }
