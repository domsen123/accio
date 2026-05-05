import type { GhConnection } from '../../database/schema'
import type { DatabaseClient } from '../../infrastructure/database/client'
import { Octokit } from '@octokit/rest'
import { eq } from 'drizzle-orm'
import { ulid } from 'ulid'
import {
  ghCommits,
  ghConnections,
  ghIssues,
  ghPulls,
  ghRepos,
  organisations,
} from '../../database/schema'
import { decryptForOrg, encryptForOrg } from '../../utils/crypto'
import {
  GhConnectionNotFoundError,
  GhTokenInsufficientScopeError,
  GhTokenInvalidError,
  GhValidationFailedError,
} from './errors'

// ─── GitHub connections service (T-4.2) ─────────────────────────────────────
//
// Refs: REQ-PROJ-1 (per-workspace PAT, validate on save, revoke retains
// cached data), DESIGN-CRYPTO (AES-256-GCM via `encryptForOrg`/`decryptForOrg`,
// shared with AI provider credentials).
//
// Responsibilities:
//   1. Encrypt-on-store, decrypt-on-validate. The plaintext token never lands
//      in any column or log line.
//   2. Validate the token on `connect` and on explicit `validate` calls by
//      hitting `GET /user`. Parse the `x-oauth-scopes` response header to
//      record the scopes the token reports.
//   3. Revoke deletes the `gh_connections` row; cached `gh_repos` rows
//      survive the delete via `ON DELETE SET NULL` (migration 0007). An
//      explicit `purgeData: true` flag on `revoke` drops cached rows too.
//
// The actual GitHub API surface (listRepos, listIssues, etc.) lives in the
// T-4.3 client wrapper. This service only owns the token lifecycle plus the
// single `GET /user` validation hop.

/**
 * Minimal interface the service needs from an Octokit-shaped object so tests
 * can swap in a mock without pulling the full SDK. The shape mirrors the
 * subset of `@octokit/rest`'s `users.getAuthenticated` we actually call.
 */
export interface OctokitLike {
  rest: {
    users: {
      getAuthenticated: () => Promise<{
        status: number
        headers: Record<string, string | undefined>
        data: { id: number, login: string }
      }>
    }
  }
}

export type OctokitFactory = (token: string) => OctokitLike

const defaultOctokitFactory: OctokitFactory = (token: string) =>
  new Octokit({ auth: token }) as unknown as OctokitLike

export interface GhConnectionsServiceDeps {
  db: DatabaseClient
  /**
   * Optional factory so tests can mock the Octokit client. Each call must
   * return a fresh client bound to the supplied token; never cache across
   * tokens (a rotated PAT must take effect immediately).
   */
  octokitFactory?: OctokitFactory
}

export interface GetStatusArgs {
  organisationId: string
}

export interface GetStatusResult {
  connected: boolean
  ghUserLogin?: string
  ghUserId?: number
  scopes?: string[]
  lastValidatedAt?: Date | null
  updatedAt?: Date | null
}

export interface ConnectArgs {
  organisationId: string
  token: string
}

export interface ConnectResult {
  connected: true
  ghUserLogin: string
  ghUserId: number
  scopes: string[]
}

export interface RevokeArgs {
  organisationId: string
  /**
   * When true, also hard-deletes all `gh_repos`, `gh_issues`, `gh_pulls`,
   * `gh_commits` rows for the workspace. Defaults to `false` per
   * REQ-PROJ-1 (cached data is retained on revoke unless explicitly
   * purged).
   */
  purgeData?: boolean
}

export interface ValidateArgs {
  organisationId: string
}

export type ValidateResult
  = | { valid: true, ghUserLogin: string, ghUserId: number, scopes: string[] }
    | { valid: false, reason: 'no_connection' | 'invalid_token' | 'insufficient_scope' | 'validation_failed' }

/**
 * Required-scope heuristic for classic PATs (REQ-PROJ-1).
 *
 * Rationale:
 *   - Classic PATs report scopes via the `x-oauth-scopes` response header on
 *     authenticated requests. To read private repos / issues / pulls / commits,
 *     classic PATs need the `repo` scope. (Public-only setups need `public_repo`,
 *     but the personal hub assumes private repos by default — REQ-PROJ-1 does
 *     not split the cases.)
 *   - Fine-grained PATs report `null`/missing for `x-oauth-scopes` (their
 *     permissions are encoded server-side, not in the header). We treat an
 *     **absent** header as "fine-grained PAT, scope check skipped" (cannot
 *     enforce — GitHub would 401/403 on the actual API call instead).
 *   - GitHub Apps installation tokens behave like fine-grained — same skip.
 *
 * The scopes returned to the caller are still recorded verbatim (empty array
 * if absent) so the UI can warn "fine-grained PAT — scope detection
 * unavailable".
 */
const REQUIRED_SCOPES_CLASSIC = ['repo'] as const

const parseScopesHeader = (header: string | undefined | null): string[] => {
  if (!header || typeof header !== 'string')
    return []
  return header
    .split(',')
    .map(s => s.trim())
    .filter(s => s.length > 0)
}

/**
 * Decide whether the token is acceptable given the parsed scopes header. If
 * the header was absent (fine-grained PAT / installation token), we accept —
 * the actual API surface enforces per-resource permissions.
 */
const hasRequiredScopes = (scopesHeaderRaw: string | undefined | null, parsed: string[]): { ok: true } | { ok: false, required: string[] } => {
  // Fine-grained PAT: header is absent / empty string. Skip scope check.
  if (scopesHeaderRaw === undefined || scopesHeaderRaw === null || scopesHeaderRaw === '')
    return { ok: true }

  // Classic PAT: enforce the required-scope set.
  const missing = REQUIRED_SCOPES_CLASSIC.filter(s => !parsed.includes(s))
  if (missing.length > 0)
    return { ok: false, required: [...REQUIRED_SCOPES_CLASSIC] }
  return { ok: true }
}

/**
 * Best-effort detection of the HTTP status on an Octokit error. The SDK
 * throws `RequestError` instances with `status: number`; older shapes use
 * `response.status` or `statusCode`. We read all three defensively rather
 * than coupling to the type.
 */
const extractHttpStatus = (err: unknown): number | undefined => {
  if (typeof err !== 'object' || err === null)
    return undefined
  const e = err as { status?: unknown, statusCode?: unknown, response?: { status?: unknown } }
  if (typeof e.status === 'number')
    return e.status
  if (typeof e.statusCode === 'number')
    return e.statusCode
  if (typeof e.response?.status === 'number')
    return e.response.status
  return undefined
}

const extractErrorMessage = (err: unknown): string => {
  if (err instanceof Error)
    return err.message
  if (typeof err === 'string')
    return err
  return String(err)
}

export const createGhConnectionsService = (deps: GhConnectionsServiceDeps) => {
  const { db } = deps
  const octokitFactory: OctokitFactory = deps.octokitFactory ?? defaultOctokitFactory

  const getOrgCryptoSalt = async (organisationId: string): Promise<string> => {
    const rows = await db
      .select({ cryptoSalt: organisations.cryptoSalt })
      .from(organisations)
      .where(eq(organisations.id, organisationId))
      .limit(1)
    const row = rows[0]
    if (!row) {
      // Organisation row missing → treat as connection-not-found from the
      // caller's perspective (the caller's session must already be scoped
      // to a real org, so this is a defensive guard rather than a hot path).
      throw new GhConnectionNotFoundError(organisationId)
    }
    return row.cryptoSalt
  }

  const findConnectionRow = async (organisationId: string): Promise<GhConnection | null> => {
    const rows = await db
      .select()
      .from(ghConnections)
      .where(eq(ghConnections.organisationId, organisationId))
      .limit(1)
    return rows[0] ?? null
  }

  /**
   * Validate the supplied PAT against `GET /user`. Returns the parsed
   * GitHub identity + scopes header (raw + parsed) on success. Throws
   * domain errors on rejection so the caller can decide whether to write
   * to the DB.
   */
  const validateTokenAgainstGitHub = async (
    organisationId: string,
    token: string,
  ): Promise<{ ghUserLogin: string, ghUserId: number, scopes: string[], scopesHeaderRaw: string | undefined }> => {
    const octokit = octokitFactory(token)

    let response: Awaited<ReturnType<OctokitLike['rest']['users']['getAuthenticated']>>
    try {
      response = await octokit.rest.users.getAuthenticated()
    }
    catch (err) {
      const status = extractHttpStatus(err)
      if (status === 401)
        throw new GhTokenInvalidError(organisationId)
      if (status === 403) {
        // 403 with no scopes header / mismatched scopes = insufficient scope.
        // 403 with a rate-limit body would normally come back via the SDK as
        // a different shape; we treat all 403s as scope failures here and let
        // the underlying message survive in `GhValidationFailedError` if the
        // SDK ever surfaces it differently. Scopes list reported is empty
        // because we don't have a successful response to read the header
        // from.
        throw new GhTokenInsufficientScopeError(organisationId, [], [...REQUIRED_SCOPES_CLASSIC])
      }
      throw new GhValidationFailedError(organisationId, extractErrorMessage(err), { cause: err as Error })
    }

    if (response.status === 401)
      throw new GhTokenInvalidError(organisationId)
    if (response.status === 403) {
      throw new GhTokenInsufficientScopeError(organisationId, [], [...REQUIRED_SCOPES_CLASSIC])
    }
    if (response.status < 200 || response.status >= 300) {
      throw new GhValidationFailedError(organisationId, `GitHub returned HTTP ${response.status}`)
    }

    // Header lookup is case-insensitive in HTTP but Octokit normalises to
    // lower-case keys; check both spellings to be safe.
    const headers = response.headers ?? {}
    const scopesHeaderRaw = headers['x-oauth-scopes'] ?? headers['X-OAuth-Scopes']
    const scopes = parseScopesHeader(scopesHeaderRaw)

    const scopeCheck = hasRequiredScopes(scopesHeaderRaw, scopes)
    if (!scopeCheck.ok)
      throw new GhTokenInsufficientScopeError(organisationId, scopes, scopeCheck.required)

    return {
      ghUserLogin: response.data.login,
      ghUserId: response.data.id,
      scopes,
      scopesHeaderRaw,
    }
  }

  /**
   * Returns a "connection status" snapshot for the workspace, suitable for
   * rendering in the UI. NEVER returns the encrypted blob, the plaintext
   * token, or any field that would let an attacker reconstruct the PAT.
   */
  const getStatus = async (args: GetStatusArgs): Promise<GetStatusResult> => {
    const row = await findConnectionRow(args.organisationId)
    if (!row)
      return { connected: false }
    return {
      connected: true,
      ghUserLogin: row.ghUserLogin,
      ghUserId: row.ghUserId,
      scopes: Array.isArray(row.scopes) ? (row.scopes as string[]) : [],
      lastValidatedAt: row.lastValidatedAt,
      updatedAt: row.updatedAt,
    }
  }

  /**
   * Validate + persist a PAT. Behaviour:
   *   - Validate first: a bad token must NOT mutate the DB. (Tests rely on
   *     this — a 401 path leaves any pre-existing row untouched.)
   *   - On success, upsert (insert if no row exists; update token / login /
   *     scopes / `last_validated_at` if one does).
   *   - The encrypted blob uses the workspace's `crypto_salt` for HKDF
   *     (DESIGN-CRYPTO).
   */
  const connect = async (args: ConnectArgs): Promise<ConnectResult> => {
    const trimmedToken = args.token.trim()
    if (!trimmedToken) {
      // Reject empty tokens up-front rather than letting GitHub return 401.
      throw new GhTokenInvalidError(args.organisationId)
    }

    // 1. Validate against GitHub before touching the DB.
    const identity = await validateTokenAgainstGitHub(args.organisationId, trimmedToken)

    // 2. Encrypt with the org's salt.
    const salt = await getOrgCryptoSalt(args.organisationId)
    const encrypted = encryptForOrg(trimmedToken, salt)

    // 3. Upsert. We spell out insert vs update rather than using
    //    `onConflictDoUpdate` because the existence-check round trip is
    //    cheap and the resulting code reads obviously.
    const existing = await findConnectionRow(args.organisationId)
    const now = new Date()

    if (existing) {
      await db
        .update(ghConnections)
        .set({
          tokenEncrypted: encrypted,
          ghUserLogin: identity.ghUserLogin,
          ghUserId: identity.ghUserId,
          scopes: identity.scopes,
          lastValidatedAt: now,
          updatedAt: now,
        })
        .where(eq(ghConnections.id, existing.id))
    }
    else {
      await db.insert(ghConnections).values({
        id: ulid(),
        organisationId: args.organisationId,
        tokenEncrypted: encrypted,
        ghUserLogin: identity.ghUserLogin,
        ghUserId: identity.ghUserId,
        scopes: identity.scopes,
        lastValidatedAt: now,
      })
    }

    return {
      connected: true,
      ghUserLogin: identity.ghUserLogin,
      ghUserId: identity.ghUserId,
      scopes: identity.scopes,
    }
  }

  /**
   * Re-validate the stored token. Updates `last_validated_at` on success.
   * Never throws domain errors on the `valid: false` branches — the caller
   * (UI "validate now" button, future health-check) wants a structured
   * result so it can render distinct messages for the four reasons. A
   * thrown error indicates a programmer bug or a DB outage; treat as 500.
   */
  const validate = async (args: ValidateArgs): Promise<ValidateResult> => {
    const row = await findConnectionRow(args.organisationId)
    if (!row)
      return { valid: false, reason: 'no_connection' }

    const salt = await getOrgCryptoSalt(args.organisationId)
    const token = decryptForOrg(row.tokenEncrypted, salt)

    try {
      const identity = await validateTokenAgainstGitHub(args.organisationId, token)
      // Bump `last_validated_at` on success — the connection row otherwise
      // stays put.
      await db
        .update(ghConnections)
        .set({ lastValidatedAt: new Date() })
        .where(eq(ghConnections.id, row.id))
      return {
        valid: true,
        ghUserLogin: identity.ghUserLogin,
        ghUserId: identity.ghUserId,
        scopes: identity.scopes,
      }
    }
    catch (err) {
      if (err instanceof GhTokenInvalidError)
        return { valid: false, reason: 'invalid_token' }
      if (err instanceof GhTokenInsufficientScopeError)
        return { valid: false, reason: 'insufficient_scope' }
      if (err instanceof GhValidationFailedError)
        return { valid: false, reason: 'validation_failed' }
      // Anything else is unexpected — let it propagate.
      throw err
    }
  }

  /**
   * Drop the connection row. With migration 0007, `gh_repos.connection_id`
   * is `ON DELETE SET NULL` so cached repos and their downstream
   * issues/pulls/commits survive the delete (REQ-PROJ-1: revoke retains
   * cached data).
   *
   * `purgeData: true` additionally hard-deletes every `gh_*` cache row for
   * the workspace, in dependency order (commits → issues → pulls → repos →
   * connection). The order matters because issues/pulls/commits FK to
   * `gh_repos` with `ON DELETE CASCADE`; deleting repos also wipes their
   * children but we delete explicitly per-table in case the cascade chain
   * is altered later.
   */
  /**
   * Decrypt the workspace's stored PAT and return it. Throws
   * `GhConnectionNotFoundError` if no connection row exists.
   *
   * Extracted in T-4.3 so the GitHub client wrapper can pull a fresh token
   * per request without duplicating the salt-lookup + decrypt dance. The
   * plaintext token never lands in any column or log line — the caller is
   * expected to hand it directly to `octokitFactory(token)` and discard.
   */
  const getDecryptedToken = async (organisationId: string): Promise<string> => {
    const row = await findConnectionRow(organisationId)
    if (!row)
      throw new GhConnectionNotFoundError(organisationId)
    const salt = await getOrgCryptoSalt(organisationId)
    return decryptForOrg(row.tokenEncrypted, salt)
  }

  /**
   * Like `getDecryptedToken` but also returns the cached `gh_user_login` so
   * the GitHub client wrapper can include it in the `getClient` envelope
   * without a second DB round trip.
   */
  const getConnectionContext = async (
    organisationId: string,
  ): Promise<{ token: string, ghUserLogin: string }> => {
    const row = await findConnectionRow(organisationId)
    if (!row)
      throw new GhConnectionNotFoundError(organisationId)
    const salt = await getOrgCryptoSalt(organisationId)
    return {
      token: decryptForOrg(row.tokenEncrypted, salt),
      ghUserLogin: row.ghUserLogin,
    }
  }

  const revoke = async (args: RevokeArgs): Promise<void> => {
    const purgeData = args.purgeData === true

    if (purgeData) {
      await db.delete(ghCommits).where(eq(ghCommits.organisationId, args.organisationId))
      await db.delete(ghIssues).where(eq(ghIssues.organisationId, args.organisationId))
      await db.delete(ghPulls).where(eq(ghPulls.organisationId, args.organisationId))
      await db.delete(ghRepos).where(eq(ghRepos.organisationId, args.organisationId))
    }

    await db
      .delete(ghConnections)
      .where(eq(ghConnections.organisationId, args.organisationId))
  }

  return {
    getStatus,
    connect,
    validate,
    revoke,
    getDecryptedToken,
    getConnectionContext,
  }
}

export type GhConnectionsService = ReturnType<typeof createGhConnectionsService>

// Re-export the connection row type so the API layer (T-4.6) can describe
// service return shapes without importing from the schema.
export type { GhConnection }
