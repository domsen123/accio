/**
 * Shared HTTP plumbing for orchestrator route handlers (T-3.8 audit-log API).
 *
 * Mirrors `server/features/ai/api-utils.ts` — Zod validation failures and
 * service-level errors are mapped to stable `(statusCode, statusMessage)`
 * pairs. ADR-012: server returns codes, the client translates.
 */
import type { H3Event } from 'h3'
import type { ZodIssue, ZodSchema } from 'zod'
import { z } from 'zod'
import {
  OrchestratorConversationNotFoundError,
  OrchestratorModelInvalidError,
} from './errors'

export const orchestratorThrow = (
  statusCode: number,
  code: string,
  data?: Record<string, unknown>,
): never => {
  throw createError({ statusCode, statusMessage: code, data })
}

export const orchestratorValidate = <T>(schema: ZodSchema<T>, value: unknown): T => {
  const result = schema.safeParse(value)
  if (!result.success) {
    const issues: ZodIssue[] = result.error.issues
    orchestratorThrow(400, 'validation.failed', {
      issues: issues.map(i => ({
        path: i.path,
        code: i.code,
        message: i.message,
      })),
    })
  }
  return (result as { success: true, data: T }).data
}

export const readOrchestratorQuery = <T>(event: H3Event, schema: ZodSchema<T>): T => {
  return orchestratorValidate(schema, getQuery(event))
}

export const readOrchestratorBody = async <T>(event: H3Event, schema: ZodSchema<T>): Promise<T> => {
  const body = await readBody(event)
  return orchestratorValidate(schema, body ?? {})
}

export const getRequiredParam = (event: H3Event, name: string, code: string): string => {
  const value = getRouterParam(event, name)?.trim()
  if (!value)
    orchestratorThrow(400, code)
  return value as string
}

/**
 * Map orchestrator service-layer domain errors to stable HTTP status codes.
 * Modelled on `mapAiError` in `server/features/ai/api-utils.ts`. Anything not
 * recognised is re-thrown unchanged.
 */
export const mapOrchestratorError = (err: unknown): never => {
  if (err instanceof OrchestratorConversationNotFoundError) {
    orchestratorThrow(404, 'orchestrator.conversation.not_found', {
      conversationId: err.conversationId,
    })
  }
  if (err instanceof OrchestratorModelInvalidError) {
    orchestratorThrow(400, 'orchestrator.conversation.model_invalid', {
      modelId: err.modelId,
      reason: err.reason,
    })
  }
  throw err
}

export const runOrchestratorServiceCall = async <T>(fn: () => Promise<T> | T): Promise<T> => {
  try {
    return await fn()
  }
  catch (err) {
    mapOrchestratorError(err)
    throw err
  }
}

export { z }
