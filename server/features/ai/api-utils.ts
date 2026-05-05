/**
 * Shared HTTP plumbing for AI Configuration route handlers (T-3.1e).
 *
 * Maps Zod validation failures and AI service errors onto stable HTTP
 * status + error code pairs. ADR-012: server returns codes, the client
 * translates.
 */
import type { H3Event } from 'h3'
import type { ZodIssue, ZodSchema } from 'zod'
import { z } from 'zod'
import {
  AiCredentialsMissingError,
  AiModelDisabledError,
  AiModelNotFoundError,
  AiNoDefaultModelError,
  AiProviderDisabledError,
  AiProviderNotFoundError,
  AiProviderUnsupportedError,
  AiUniqueConflictError,
} from './errors'

export const aiThrow = (
  statusCode: number,
  code: string,
  data?: Record<string, unknown>,
): never => {
  throw createError({ statusCode, statusMessage: code, data })
}

export const aiValidate = <T>(schema: ZodSchema<T>, value: unknown): T => {
  const result = schema.safeParse(value)
  if (!result.success) {
    const issues: ZodIssue[] = result.error.issues
    aiThrow(400, 'validation.failed', {
      issues: issues.map(i => ({
        path: i.path,
        code: i.code,
        message: i.message,
      })),
    })
  }
  return (result as { success: true, data: T }).data
}

export const readAiBody = async <T>(event: H3Event, schema: ZodSchema<T>): Promise<T> => {
  const body = await readBody(event)
  return aiValidate(schema, body ?? {})
}

export const readAiQuery = <T>(event: H3Event, schema: ZodSchema<T>): T => {
  return aiValidate(schema, getQuery(event))
}

export const mapAiError = (err: unknown): never => {
  if (err instanceof AiModelNotFoundError)
    aiThrow(404, 'ai.model.not_found', { modelId: err.modelId })
  if (err instanceof AiModelDisabledError)
    aiThrow(409, 'ai.model.disabled', { modelId: err.modelId })
  if (err instanceof AiProviderDisabledError)
    aiThrow(409, 'ai.provider.disabled', { providerKey: err.providerKey })
  if (err instanceof AiProviderUnsupportedError)
    aiThrow(409, 'ai.provider.unsupported', { providerKey: err.providerKey })
  if (err instanceof AiProviderNotFoundError)
    aiThrow(404, 'ai.provider.not_found', { providerId: err.providerId })
  if (err instanceof AiCredentialsMissingError) {
    aiThrow(404, 'ai.credentials.missing', {
      organisationId: err.organisationId,
      providerKey: err.providerKey,
    })
  }
  if (err instanceof AiNoDefaultModelError) {
    aiThrow(404, 'ai.default_model.missing', {
      organisationId: err.organisationId,
    })
  }
  if (err instanceof AiUniqueConflictError) {
    const code = err.resource === 'credentials'
      ? 'ai.credentials.conflict'
      : 'ai.model.conflict'
    aiThrow(409, code, err.detail)
  }
  throw err
}

export const runAiServiceCall = async <T>(fn: () => Promise<T> | T): Promise<T> => {
  try {
    return await fn()
  }
  catch (err) {
    mapAiError(err)
    throw err
  }
}

export const getRequiredParam = (event: H3Event, name: string, code: string): string => {
  const value = getRouterParam(event, name)?.trim()
  if (!value)
    aiThrow(400, code)
  return value as string
}

export { z }
