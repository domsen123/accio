import type { DatabaseClient } from '../../infrastructure/database/client'
import type { GhConnectionsService } from './connections.service'
import type { CommitSnapshot, GhUserRef, IssueSnapshot, PullSnapshot, RepoSnapshot } from './types'
import { Octokit } from '@octokit/rest'
import {
  GhClientNotConnectedError,
  GhConnectionNotFoundError,
  GhRateLimitedError,
  GhResourceNotFoundError,
  GhTokenInvalidError,
  GhValidationFailedError,
} from './errors'

// ─── GitHub API client wrapper (T-4.3) ──────────────────────────────────────
//
// Refs: REQ-PROJ-2 (list accessible repos), REQ-PROJ-3 (sync repo metadata,
// open issues, open PRs, last 50 commits), DESIGN-DATA §Projects.
//
// Responsibilities:
//   1. Resolve a workspace's PAT via `ghConnectionsService.getDecryptedToken`
//      and construct a fresh Octokit instance per call. NEVER cache across
//      requests — DESIGN-AI's credential-rotation rule applies equally here.
//   2. Expose a small set of high-level helpers (listAccessibleRepos,
//      getRepo, listIssues, listPulls, listCommits) that hide pagination and
//      return normalised `*Snapshot` shapes ready for T-4.4's sync service
//      to insert.
//   3. Map HTTP errors to domain errors:
//        401 → GhTokenInvalidError
//        403 + x-ratelimit-remaining=0 → GhRateLimitedError (with resetAt)
//        403 (other) → GhValidationFailedError
//        404 → GhResourceNotFoundError
//        anything else → GhValidationFailedError

/**
 * Minimal Octokit-shaped interface this wrapper needs. Tests inject a fake
 * factory that returns this shape; production wires `@octokit/rest`.
 */
export interface OctokitLike {
  rest: {
    repos: {
      listForAuthenticatedUser: (params: {
        affiliation?: string
        per_page?: number
        page?: number
        sort?: string
      }) => Promise<{ status: number, headers: Record<string, string | undefined>, data: GhRepoApi[] }>
      get: (params: { owner: string, repo: string }) => Promise<{ status: number, headers: Record<string, string | undefined>, data: GhRepoApi }>
      listCommits: (params: {
        owner: string
        repo: string
        sha?: string
        per_page?: number
        page?: number
      }) => Promise<{ status: number, headers: Record<string, string | undefined>, data: GhCommitApi[] }>
    }
    issues: {
      listForRepo: (params: {
        owner: string
        repo: string
        state?: 'open' | 'closed' | 'all'
        per_page?: number
        page?: number
      }) => Promise<{ status: number, headers: Record<string, string | undefined>, data: GhIssueApi[] }>
    }
    pulls: {
      list: (params: {
        owner: string
        repo: string
        state?: 'open' | 'closed' | 'all'
        per_page?: number
        page?: number
      }) => Promise<{ status: number, headers: Record<string, string | undefined>, data: GhPullApi[] }>
    }
  }
}

export type OctokitFactory = (token: string) => OctokitLike

const defaultOctokitFactory: OctokitFactory = (token: string) =>
  new Octokit({ auth: token }) as unknown as OctokitLike

// ─── GitHub API response shapes ─────────────────────────────────────────────
//
// We declare the subset of fields we read so the wrapper compiles without
// pulling `@octokit/openapi-types` everywhere. Anything we don't read stays
// `unknown`.

interface GhUserApi {
  login: string
  id?: number
  avatar_url?: string | null
}

interface GhLabelApi {
  name: string
}

export interface GhRepoApi {
  id: number
  owner: { login: string }
  name: string
  full_name: string
  description: string | null
  private: boolean
  default_branch: string | null
  html_url: string
  created_at: string | null
  updated_at: string | null
}

export interface GhIssueApi {
  id: number
  number: number
  title: string
  body: string | null
  state: 'open' | 'closed'
  state_reason?: string | null
  labels?: Array<string | GhLabelApi>
  assignees?: GhUserApi[] | null
  user: GhUserApi | null
  comments?: number
  created_at: string | null
  updated_at: string | null
  closed_at: string | null
  html_url: string
  pull_request?: unknown
}

export interface GhPullApi {
  id: number
  number: number
  title: string
  body: string | null
  state: 'open' | 'closed'
  draft?: boolean | null
  base: { ref: string }
  head: { ref: string }
  labels?: Array<string | GhLabelApi>
  assignees?: GhUserApi[] | null
  requested_reviewers?: GhUserApi[] | null
  user: GhUserApi | null
  comments?: number
  additions?: number | null
  deletions?: number | null
  changed_files?: number | null
  created_at: string | null
  updated_at: string | null
  closed_at: string | null
  merged_at: string | null
  html_url: string
}

export interface GhCommitApi {
  sha: string
  commit: {
    message: string
    author?: { name?: string | null, email?: string | null, date?: string | null } | null
    committer?: { name?: string | null, email?: string | null, date?: string | null } | null
  }
  author?: GhUserApi | null
  committer?: GhUserApi | null
  html_url: string
  parents?: Array<{ sha: string }>
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Hard cap on auto-paginated fetches so a misconfigured PAT (or a runaway
 * token with thousands of org repos) cannot wedge the server. T-4.4's sync
 * service can split tracked repos across multiple ticks if a workspace
 * legitimately exceeds this — REQ-PROJ-2 lists "the repositories accessible
 * by the connected token", in practice <1000 for a personal hub.
 */
const MAX_AUTO_PAGES = 10
const DEFAULT_PER_PAGE = 100
const DEFAULT_COMMIT_LIMIT = 50

const parseDate = (value: string | null | undefined): Date | null => {
  if (!value)
    return null
  const t = Date.parse(value)
  if (Number.isNaN(t))
    return null
  return new Date(t)
}

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

const extractHeaders = (err: unknown): Record<string, string | undefined> => {
  if (typeof err !== 'object' || err === null)
    return {}
  const e = err as { response?: { headers?: unknown }, headers?: unknown }
  const candidate = (e.response?.headers ?? e.headers) as unknown
  if (typeof candidate !== 'object' || candidate === null)
    return {}
  return candidate as Record<string, string | undefined>
}

const extractErrorMessage = (err: unknown): string => {
  if (err instanceof Error)
    return err.message
  if (typeof err === 'string')
    return err
  return String(err)
}

/**
 * Decide whether a 403 is a rate-limit hit. GitHub signals rate-limit via
 * `x-ratelimit-remaining: 0` on the response (and a `retry-after` body for
 * secondary limits, but we only honour the primary limit here for v1).
 */
const isRateLimited = (headers: Record<string, string | undefined>): boolean => {
  const remaining = headers['x-ratelimit-remaining'] ?? headers['X-RateLimit-Remaining']
  return remaining === '0'
}

const parseResetAt = (headers: Record<string, string | undefined>): Date | null => {
  const raw = headers['x-ratelimit-reset'] ?? headers['X-RateLimit-Reset']
  if (!raw)
    return null
  const seconds = Number.parseInt(raw, 10)
  if (Number.isNaN(seconds))
    return null
  return new Date(seconds * 1000)
}

/**
 * Map a thrown Octokit error / non-2xx response to a domain error. The
 * `resource` argument identifies the resource for 404s (e.g. `octocat/hello`,
 * `octocat/hello#42`) so the UI can render a precise message.
 */
const mapErrorToDomain = (
  organisationId: string,
  err: unknown,
  resource: string,
): never => {
  const status = extractHttpStatus(err)
  const headers = extractHeaders(err)

  if (status === 401)
    throw new GhTokenInvalidError(organisationId)

  if (status === 403) {
    if (isRateLimited(headers))
      throw new GhRateLimitedError(organisationId, parseResetAt(headers))
    throw new GhValidationFailedError(organisationId, extractErrorMessage(err), { cause: err as Error })
  }

  if (status === 404)
    throw new GhResourceNotFoundError(organisationId, resource)

  throw new GhValidationFailedError(organisationId, extractErrorMessage(err), { cause: err as Error })
}

/**
 * Same translation as `mapErrorToDomain`, but for non-2xx responses returned
 * without throwing (the SDK normally throws, but defensive code here keeps
 * the wrapper symmetric with the connections service).
 */
const checkResponseStatus = <T>(
  organisationId: string,
  response: { status: number, headers: Record<string, string | undefined>, data: T },
  resource: string,
): T => {
  const { status, headers } = response
  if (status >= 200 && status < 300)
    return response.data
  if (status === 401)
    throw new GhTokenInvalidError(organisationId)
  if (status === 403) {
    if (isRateLimited(headers))
      throw new GhRateLimitedError(organisationId, parseResetAt(headers))
    throw new GhValidationFailedError(organisationId, `GitHub returned HTTP ${status}`)
  }
  if (status === 404)
    throw new GhResourceNotFoundError(organisationId, resource)
  throw new GhValidationFailedError(organisationId, `GitHub returned HTTP ${status}`)
}

// ─── Normalisers ────────────────────────────────────────────────────────────

const normaliseUser = (u: GhUserApi | null | undefined, fallbackLogin = 'unknown'): GhUserRef => {
  if (!u)
    return { login: fallbackLogin }
  return {
    login: u.login,
    id: u.id,
    avatarUrl: u.avatar_url ?? null,
  }
}

const normaliseLabels = (labels: Array<string | GhLabelApi> | undefined | null): string[] => {
  if (!labels)
    return []
  return labels.map(l => (typeof l === 'string' ? l : l.name)).filter(Boolean)
}

const normaliseRepo = (r: GhRepoApi): RepoSnapshot => ({
  ghId: r.id,
  owner: r.owner.login,
  name: r.name,
  fullName: r.full_name,
  description: r.description ?? null,
  private: r.private,
  defaultBranch: r.default_branch ?? null,
  htmlUrl: r.html_url,
  ghCreatedAt: parseDate(r.created_at),
  ghUpdatedAt: parseDate(r.updated_at),
})

const normaliseIssue = (i: GhIssueApi): IssueSnapshot => ({
  ghId: i.id,
  number: i.number,
  title: i.title,
  body: i.body ?? null,
  state: i.state,
  stateReason: i.state_reason ?? null,
  labels: normaliseLabels(i.labels),
  assignees: (i.assignees ?? []).map(a => normaliseUser(a)),
  author: normaliseUser(i.user),
  commentsCount: i.comments ?? 0,
  ghCreatedAt: parseDate(i.created_at),
  ghUpdatedAt: parseDate(i.updated_at),
  ghClosedAt: parseDate(i.closed_at),
  htmlUrl: i.html_url,
})

const normalisePull = (p: GhPullApi): PullSnapshot => {
  const mergedAt = parseDate(p.merged_at)
  // GitHub returns `state: 'open' | 'closed'`; promote merged-and-closed to
  // the dedicated `merged` state so the column matches `gh_pull_state`.
  const state: PullSnapshot['state']
    = p.state === 'closed' && mergedAt !== null ? 'merged' : p.state
  return {
    ghId: p.id,
    number: p.number,
    title: p.title,
    body: p.body ?? null,
    state,
    draft: p.draft ?? false,
    baseRef: p.base.ref,
    headRef: p.head.ref,
    labels: normaliseLabels(p.labels),
    assignees: (p.assignees ?? []).map(a => normaliseUser(a)),
    requestedReviewers: (p.requested_reviewers ?? []).map(a => normaliseUser(a)),
    author: normaliseUser(p.user),
    commentsCount: p.comments ?? 0,
    // Diff stats are absent from the list endpoint — leave null. T-4.4 may
    // hydrate per-PR via `GET /repos/.../pulls/{number}`.
    additions: p.additions ?? null,
    deletions: p.deletions ?? null,
    changedFiles: p.changed_files ?? null,
    ghCreatedAt: parseDate(p.created_at),
    ghUpdatedAt: parseDate(p.updated_at),
    ghClosedAt: parseDate(p.closed_at),
    ghMergedAt: mergedAt,
    htmlUrl: p.html_url,
  }
}

const normaliseCommit = (c: GhCommitApi): CommitSnapshot => ({
  sha: c.sha,
  message: c.commit.message,
  authorName: c.commit.author?.name ?? null,
  authorEmail: c.commit.author?.email ?? null,
  authorLogin: c.author?.login ?? null,
  authorAvatarUrl: c.author?.avatar_url ?? null,
  authoredAt: parseDate(c.commit.author?.date ?? null),
  committerLogin: c.committer?.login ?? null,
  committedAt: parseDate(c.commit.committer?.date ?? null),
  htmlUrl: c.html_url,
  parents: (c.parents ?? []).map(p => p.sha),
})

// ─── Service ────────────────────────────────────────────────────────────────

// Helper that wraps an Octokit call, translating thrown errors and non-2xx
// responses into domain errors. Defined at module scope so it can be reused
// across all the surface methods.
const callGitHub = async <T>(
  fn: () => Promise<{ status: number, headers: Record<string, string | undefined>, data: T }>,
  organisationId: string,
  resource: string,
): Promise<T> => {
  let response: { status: number, headers: Record<string, string | undefined>, data: T }
  try {
    response = await fn()
  }
  catch (err) {
    return mapErrorToDomain(organisationId, err, resource)
  }
  return checkResponseStatus(organisationId, response, resource)
}

export interface GhClientServiceDeps {
  db: DatabaseClient
  ghConnectionsService: Pick<GhConnectionsService, 'getConnectionContext'>
  /**
   * Optional factory so tests can mock the Octokit client. Each call must
   * return a fresh client bound to the supplied token; never cache across
   * tokens (a rotated PAT must take effect immediately — DESIGN-AI rule).
   */
  octokitFactory?: OctokitFactory
}

export interface GetClientResult {
  octokit: OctokitLike
  ghUserLogin: string
}

export interface ListAccessibleReposOpts {
  perPage?: number
  page?: number
}

export interface RepoArgs {
  organisationId: string
  owner: string
  name: string
}

export interface ListIssuesArgs extends RepoArgs {
  state?: 'open' | 'closed' | 'all'
}

export interface ListPullsArgs extends RepoArgs {
  state?: 'open' | 'closed' | 'all'
}

export interface ListCommitsArgs extends RepoArgs {
  sha?: string
  limit?: number
}

export const createGhClientService = (deps: GhClientServiceDeps) => {
  const { ghConnectionsService } = deps
  const octokitFactory: OctokitFactory = deps.octokitFactory ?? defaultOctokitFactory

  /**
   * Fetch a fresh Octokit client for the workspace. Throws
   * `GhClientNotConnectedError` if no connection row exists. Does not cache —
   * every call re-reads the DB and rebuilds the client (DESIGN-AI parallel:
   * key rotations and revokes take effect immediately).
   */
  const getClient = async (organisationId: string): Promise<GetClientResult> => {
    let ctx: { token: string, ghUserLogin: string }
    try {
      ctx = await ghConnectionsService.getConnectionContext(organisationId)
    }
    catch (err) {
      if (err instanceof GhConnectionNotFoundError)
        throw new GhClientNotConnectedError(organisationId)
      throw err
    }
    return {
      octokit: octokitFactory(ctx.token),
      ghUserLogin: ctx.ghUserLogin,
    }
  }

  /**
   * REQ-PROJ-2 — list every repo the PAT can see across owner / collaborator
   * / org-member affiliations. Pagination is hidden behind an iterator: pass
   * `page` to fetch a single page; omit it to auto-fetch all pages (capped
   * at `MAX_AUTO_PAGES`).
   */
  const listAccessibleRepos = async (
    organisationId: string,
    opts: ListAccessibleReposOpts = {},
  ): Promise<RepoSnapshot[]> => {
    const { octokit } = await getClient(organisationId)
    const perPage = opts.perPage ?? DEFAULT_PER_PAGE

    if (opts.page !== undefined) {
      // Caller wants a specific page — single round trip, no auto-paginate.
      const data = await callGitHub(
        () => octokit.rest.repos.listForAuthenticatedUser({
          affiliation: 'owner,collaborator,organization_member',
          per_page: perPage,
          page: opts.page,
        }),
        organisationId,
        'user/repos',
      )
      return data.map(normaliseRepo)
    }

    const all: GhRepoApi[] = []
    for (let page = 1; page <= MAX_AUTO_PAGES; page += 1) {
      const data = await callGitHub(
        () => octokit.rest.repos.listForAuthenticatedUser({
          affiliation: 'owner,collaborator,organization_member',
          per_page: perPage,
          page,
        }),
        organisationId,
        'user/repos',
      )
      all.push(...data)
      if (data.length < perPage)
        break
    }
    return all.map(normaliseRepo)
  }

  const getRepo = async (args: RepoArgs): Promise<RepoSnapshot> => {
    const { octokit } = await getClient(args.organisationId)
    const data = await callGitHub(
      () => octokit.rest.repos.get({ owner: args.owner, repo: args.name }),
      args.organisationId,
      `${args.owner}/${args.name}`,
    )
    return normaliseRepo(data)
  }

  /**
   * Pulls all pages of issues for the repo. Filters out PRs — GitHub's
   * `GET /repos/.../issues` returns PRs as issues with a `pull_request`
   * field. Defaults to `state: 'open'` per REQ-PROJ-3.
   */
  const listIssues = async (args: ListIssuesArgs): Promise<IssueSnapshot[]> => {
    const { octokit } = await getClient(args.organisationId)
    const state = args.state ?? 'open'
    const all: GhIssueApi[] = []
    for (let page = 1; page <= MAX_AUTO_PAGES; page += 1) {
      const data = await callGitHub(
        () => octokit.rest.issues.listForRepo({
          owner: args.owner,
          repo: args.name,
          state,
          per_page: DEFAULT_PER_PAGE,
          page,
        }),
        args.organisationId,
        `${args.owner}/${args.name}#issues`,
      )
      all.push(...data)
      if (data.length < DEFAULT_PER_PAGE)
        break
    }
    return all
      .filter(i => i.pull_request === undefined || i.pull_request === null)
      .map(normaliseIssue)
  }

  /**
   * Pulls all pages of pull requests. Defaults to `state: 'open'`. Diff
   * stats (additions/deletions/changedFiles) are not populated by the list
   * endpoint — left null in the snapshot.
   */
  const listPulls = async (args: ListPullsArgs): Promise<PullSnapshot[]> => {
    const { octokit } = await getClient(args.organisationId)
    const state = args.state ?? 'open'
    const all: GhPullApi[] = []
    for (let page = 1; page <= MAX_AUTO_PAGES; page += 1) {
      const data = await callGitHub(
        () => octokit.rest.pulls.list({
          owner: args.owner,
          repo: args.name,
          state,
          per_page: DEFAULT_PER_PAGE,
          page,
        }),
        args.organisationId,
        `${args.owner}/${args.name}#pulls`,
      )
      all.push(...data)
      if (data.length < DEFAULT_PER_PAGE)
        break
    }
    return all.map(normalisePull)
  }

  /**
   * REQ-PROJ-3 — last 50 commits per tracked repo by default. `limit` is
   * applied by truncating after pagination; we still ask GitHub for full
   * pages so a `limit: 50` over a 100-page-size request only needs one
   * round trip.
   */
  const listCommits = async (args: ListCommitsArgs): Promise<CommitSnapshot[]> => {
    const { octokit } = await getClient(args.organisationId)
    const limit = args.limit ?? DEFAULT_COMMIT_LIMIT
    if (limit <= 0)
      return []

    const all: GhCommitApi[] = []
    const perPage = Math.min(DEFAULT_PER_PAGE, limit)
    for (let page = 1; page <= MAX_AUTO_PAGES; page += 1) {
      const data = await callGitHub(
        () => octokit.rest.repos.listCommits({
          owner: args.owner,
          repo: args.name,
          sha: args.sha,
          per_page: perPage,
          page,
        }),
        args.organisationId,
        `${args.owner}/${args.name}#commits`,
      )
      all.push(...data)
      if (all.length >= limit)
        break
      if (data.length < perPage)
        break
    }
    return all.slice(0, limit).map(normaliseCommit)
  }

  return {
    getClient,
    listAccessibleRepos,
    getRepo,
    listIssues,
    listPulls,
    listCommits,
  }
}

export type GhClientService = ReturnType<typeof createGhClientService>
