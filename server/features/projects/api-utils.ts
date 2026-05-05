/**
 * Shared HTTP plumbing for projects route handlers (T-4.2 / T-4.6).
 *
 * Mirrors `server/features/orchestrator/api-utils.ts` and `server/features/ai/api-utils.ts`:
 * Zod validation failures and projects service-level domain errors are mapped
 * to stable `(statusCode, statusMessage)` pairs. ADR-012: server returns
 * codes, the client translates.
 *
 * No API routes consume this yet — they land in T-4.6. The mapping lives here
 * so the contract is fixed alongside the service it describes.
 */
import type { H3Event } from 'h3'
import type { ZodIssue, ZodSchema } from 'zod'
import { z } from 'zod'
import {
  GhClientNotConnectedError,
  GhConnectionNotFoundError,
  GhRateLimitedError,
  GhRepoNotFoundError,
  GhResourceNotFoundError,
  GhSyncFailedError,
  GhTokenInsufficientScopeError,
  GhTokenInvalidError,
  GhValidationFailedError,
} from './errors'

export const projectsThrow = (
  statusCode: number,
  code: string,
  data?: Record<string, unknown>,
): never => {
  throw createError({ statusCode, statusMessage: code, data })
}

export const projectsValidate = <T>(schema: ZodSchema<T>, value: unknown): T => {
  const result = schema.safeParse(value)
  if (!result.success) {
    const issues: ZodIssue[] = result.error.issues
    projectsThrow(400, 'validation.failed', {
      issues: issues.map(i => ({
        path: i.path,
        code: i.code,
        message: i.message,
      })),
    })
  }
  return (result as { success: true, data: T }).data
}

export const readProjectsBody = async <T>(event: H3Event, schema: ZodSchema<T>): Promise<T> => {
  const body = await readBody(event)
  return projectsValidate(schema, body ?? {})
}

export const readProjectsQuery = <T>(event: H3Event, schema: ZodSchema<T>): T => {
  return projectsValidate(schema, getQuery(event))
}

export const getRequiredParam = (event: H3Event, name: string, code: string): string => {
  const value = getRouterParam(event, name)?.trim()
  if (!value)
    projectsThrow(400, code)
  return value as string
}

/**
 * Map projects service-layer domain errors to stable HTTP status codes.
 *
 * Status code rationale:
 * - `gh.connection.not_found` → 404: standard "no such resource".
 * - `gh.token.invalid` → 401: mirrors AI's `ai.credentials.missing` 404 vs
 *   actual auth failure; an invalid token is an auth-class error which warrants
 *   401, not 400 (the request shape was fine; the credential was rejected).
 * - `gh.token.insufficient_scope` → 403: GitHub authenticated the user but
 *   refused the operation due to scopes; 403 matches GitHub's own response.
 * - `gh.validation.failed` → 502: upstream (GitHub) failure surfaces as a bad
 *   gateway from our perspective.
 */
export const mapProjectsError = (err: unknown): never => {
  if (err instanceof GhConnectionNotFoundError) {
    projectsThrow(404, 'gh.connection.not_found', {
      organisationId: err.organisationId,
    })
  }
  if (err instanceof GhTokenInvalidError) {
    projectsThrow(401, 'gh.token.invalid', {
      organisationId: err.organisationId,
    })
  }
  if (err instanceof GhTokenInsufficientScopeError) {
    projectsThrow(403, 'gh.token.insufficient_scope', {
      organisationId: err.organisationId,
      reportedScopes: err.reportedScopes,
      requiredScopes: err.requiredScopes,
    })
  }
  if (err instanceof GhValidationFailedError) {
    projectsThrow(502, 'gh.validation.failed', {
      organisationId: err.organisationId,
      underlying: err.underlying,
    })
  }
  if (err instanceof GhClientNotConnectedError) {
    projectsThrow(409, 'gh.client.not_connected', {
      organisationId: err.organisationId,
    })
  }
  if (err instanceof GhRateLimitedError) {
    projectsThrow(429, 'gh.rate_limited', {
      organisationId: err.organisationId,
      resetAt: err.resetAt ? err.resetAt.toISOString() : null,
    })
  }
  if (err instanceof GhRepoNotFoundError) {
    projectsThrow(404, 'gh.repo.not_found', {
      organisationId: err.organisationId,
      identifier: err.identifier,
    })
  }
  if (err instanceof GhResourceNotFoundError) {
    projectsThrow(404, 'gh.resource.not_found', {
      organisationId: err.organisationId,
      resource: err.resource,
    })
  }
  if (err instanceof GhSyncFailedError) {
    projectsThrow(502, 'gh.sync.failed', {
      organisationId: err.organisationId,
      repoId: err.repoId,
      underlying: err.underlying,
    })
  }
  throw err
}

export const runProjectsServiceCall = async <T>(fn: () => Promise<T> | T): Promise<T> => {
  try {
    return await fn()
  }
  catch (err) {
    mapProjectsError(err)
    throw err
  }
}

export { z }
