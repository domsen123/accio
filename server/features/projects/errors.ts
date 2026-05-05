// Domain errors for the projects feature (GitHub connection service, T-4.2).
//
// Mirrors the AI feature's error pattern: thrown by `ghConnectionsService`
// and mapped to stable HTTP codes in `api-utils.ts` (consumed by T-4.6).
//
// All errors carry the relevant identifiers so the UI can render a useful
// message without re-querying the DB.

/**
 * Thrown when the workspace has no `gh_connections` row but the operation
 * requires one (e.g. `validate` before `connect`, or `getStatus` shape
 * "connected: true" expected by callers).
 */
export class GhConnectionNotFoundError extends Error {
  readonly organisationId: string
  constructor(organisationId: string) {
    super(`No GitHub connection configured for workspace "${organisationId}"`)
    this.name = 'GhConnectionNotFoundError'
    this.organisationId = organisationId
  }
}

/**
 * Thrown when GitHub rejects the supplied PAT with HTTP 401 (token revoked,
 * mistyped, or expired).
 */
export class GhTokenInvalidError extends Error {
  readonly organisationId: string
  constructor(organisationId: string) {
    super(`GitHub rejected the token for workspace "${organisationId}"`)
    this.name = 'GhTokenInvalidError'
    this.organisationId = organisationId
  }
}

/**
 * Thrown when the token authenticates successfully but lacks the scopes
 * required by the connection contract (REQ-PROJ-1: `repo` for private repo
 * read on classic PATs; fine-grained PATs report no scopes header — see the
 * heuristic documented in `connections.service.ts`).
 *
 * Carries the scopes GitHub reported so the UI / API caller can render the
 * exact gap.
 */
export class GhTokenInsufficientScopeError extends Error {
  readonly organisationId: string
  readonly reportedScopes: string[]
  readonly requiredScopes: string[]
  constructor(organisationId: string, reportedScopes: string[], requiredScopes: string[]) {
    super(
      `GitHub token for workspace "${organisationId}" is missing required scopes: `
      + `reported=[${reportedScopes.join(',')}] required=[${requiredScopes.join(',')}]`,
    )
    this.name = 'GhTokenInsufficientScopeError'
    this.organisationId = organisationId
    this.reportedScopes = reportedScopes
    this.requiredScopes = requiredScopes
  }
}

/**
 * Thrown for transport-level / non-401 / non-403 failures during validation
 * (rate-limit, network error, 5xx). Carries the underlying message so the
 * UI / logs surface what GitHub actually said.
 */
export class GhValidationFailedError extends Error {
  readonly organisationId: string
  readonly underlying: string
  constructor(organisationId: string, underlying: string, options?: ErrorOptions) {
    super(`GitHub validation failed for workspace "${organisationId}": ${underlying}`, options)
    this.name = 'GhValidationFailedError'
    this.organisationId = organisationId
    this.underlying = underlying
  }
}

/**
 * Thrown by the GitHub client wrapper (T-4.3) when a caller attempts to use
 * the GitHub API but the workspace has no `gh_connections` row. Distinct from
 * `GhConnectionNotFoundError` (which is thrown by the connections service for
 * lifecycle operations) so the API layer can map this to a 409 / "connect
 * GitHub first" UI message rather than a generic 404.
 */
export class GhClientNotConnectedError extends Error {
  readonly organisationId: string
  constructor(organisationId: string) {
    super(`No GitHub connection configured for workspace "${organisationId}" — connect a PAT before calling the GitHub API`)
    this.name = 'GhClientNotConnectedError'
    this.organisationId = organisationId
  }
}

/**
 * Thrown by the GitHub client wrapper (T-4.3) when GitHub returns 403 with a
 * rate-limit signal (`x-ratelimit-remaining: 0`). Carries the reset time
 * parsed from `x-ratelimit-reset` (UTC seconds → `Date`) when present so the
 * UI can render "try again at 14:32".
 *
 * 403s without a rate-limit header are still surfaced via `GhValidationFailedError`
 * (e.g. SSO enforcement, IP allow-list block) — the rate-limit branch is the
 * only one we promise to expose distinctly here.
 */
export class GhRateLimitedError extends Error {
  readonly organisationId: string
  readonly resetAt: Date | null
  constructor(organisationId: string, resetAt: Date | null) {
    super(`GitHub rate limit hit for workspace "${organisationId}"${resetAt ? ` (resets at ${resetAt.toISOString()})` : ''}`)
    this.name = 'GhRateLimitedError'
    this.organisationId = organisationId
    this.resetAt = resetAt
  }
}

/**
 * Thrown by the GitHub client wrapper (T-4.3) when GitHub returns 404 for a
 * resource (repo / issue / pull / commit). Carries the resource identifier
 * for the UI / logs.
 */
export class GhResourceNotFoundError extends Error {
  readonly organisationId: string
  readonly resource: string
  constructor(organisationId: string, resource: string) {
    super(`GitHub resource "${resource}" not found for workspace "${organisationId}"`)
    this.name = 'GhResourceNotFoundError'
    this.organisationId = organisationId
    this.resource = resource
  }
}

/**
 * Thrown by the sync service (T-4.4) when a `gh_repos` row is required but
 * missing. Distinct from `GhResourceNotFoundError` (which describes an absent
 * upstream GitHub resource): this one signals "we have no local cache row for
 * this workspace + (repoId | owner/name)". Carries whichever identifier the
 * caller supplied so the API layer can render a precise message.
 */
export class GhRepoNotFoundError extends Error {
  readonly organisationId: string
  readonly identifier: string
  constructor(organisationId: string, identifier: string) {
    super(`GitHub repo "${identifier}" not found in workspace "${organisationId}" cache`)
    this.name = 'GhRepoNotFoundError'
    this.organisationId = organisationId
    this.identifier = identifier
  }
}

/**
 * Thrown by the sync service (T-4.4) to wrap an underlying error that is
 * specifically a sync-time failure (DB upsert blew up, an unexpected throw
 * during the orchestration step) rather than an authentication/connection
 * failure. The connection-layer errors (`GhTokenInvalidError`,
 * `GhRateLimitedError`, `GhClientNotConnectedError`, `GhResourceNotFoundError`)
 * propagate unchanged so the API layer can surface them distinctly.
 */
export class GhSyncFailedError extends Error {
  readonly organisationId: string
  readonly repoId: string | null
  readonly underlying: string
  constructor(organisationId: string, repoId: string | null, underlying: string, options?: ErrorOptions) {
    super(`GitHub sync failed for workspace "${organisationId}"${repoId ? ` repo "${repoId}"` : ''}: ${underlying}`, options)
    this.name = 'GhSyncFailedError'
    this.organisationId = organisationId
    this.repoId = repoId
    this.underlying = underlying
  }
}
