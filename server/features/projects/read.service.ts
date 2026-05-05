/**
 * Read-side accessors for the cached GitHub data (T-4.6).
 *
 * Refs: REQ-PROJ-5 (read-only display: repos, issues, pulls, commits),
 * REQ-PROJ-2 (per-workspace repo selection), DESIGN-API §Projects.
 *
 * The sync service (T-4.4) handles writes (track toggle, sync, purge); this
 * service is a separate read-only surface so the API routes that render the
 * UI can stay independent of the upstream GitHub client. All queries are
 * workspace-scoped — cross-org ids return null / empty so the API layer can
 * translate to 404 without leaking existence.
 *
 * Pagination defaults match the orchestrator audit conventions
 * (`limit=50, max=200`); commits uses a separate cap (max 200) since the
 * underlying upstream limit is 50/repo by default.
 */
import type { GhCommit, GhIssue, GhPull, GhRepo } from '../../database/schema'
import type { DatabaseClient } from '../../infrastructure/database/client'
import { and, asc, desc, eq, gte, ilike, isNull, or, sql } from 'drizzle-orm'
import { ghCommits, ghIssues, ghPulls, ghRepos } from '../../database/schema'

export const REPOS_LIST_DEFAULT_LIMIT = 50
export const REPOS_LIST_MAX_LIMIT = 200
export const ISSUES_LIST_DEFAULT_LIMIT = 50
export const ISSUES_LIST_MAX_LIMIT = 200
export const PULLS_LIST_DEFAULT_LIMIT = 50
export const PULLS_LIST_MAX_LIMIT = 200
export const COMMITS_LIST_DEFAULT_LIMIT = 50
export const COMMITS_LIST_MAX_LIMIT = 200

export type IssueStateFilter = 'open' | 'closed' | 'all'
export type PullStateFilter = 'open' | 'closed' | 'merged' | 'all'

export interface Pagination {
  limit?: number
  offset?: number
}

export interface ListReposArgs {
  organisationId: string
  filter?: {
    tracked?: boolean
    q?: string
    includeDeleted?: boolean
  }
  pagination?: Pagination
}

export interface ListReposResult {
  rows: GhRepo[]
  total: number
}

export interface GetRepoArgs {
  organisationId: string
  repoId: string
}

export interface ListIssuesArgs {
  organisationId: string
  repoId: string
  filter?: {
    state?: IssueStateFilter
    labels?: string[]
    q?: string
  }
  pagination?: Pagination
  sort?: 'createdAt:desc' | 'createdAt:asc' | 'updatedAt:desc' | 'updatedAt:asc'
}

export interface ListIssuesResult {
  rows: GhIssue[]
  total: number
}

export interface ListPullsArgs {
  organisationId: string
  repoId: string
  filter?: {
    state?: PullStateFilter
    labels?: string[]
    q?: string
  }
  pagination?: Pagination
  sort?: 'createdAt:desc' | 'createdAt:asc' | 'updatedAt:desc' | 'updatedAt:asc'
}

export interface ListPullsResult {
  rows: GhPull[]
  total: number
}

export interface ListCommitsArgs {
  organisationId: string
  repoId: string
  filter?: {
    since?: Date
    author?: string
  }
  pagination?: Pagination
}

export interface ListCommitsResult {
  rows: GhCommit[]
  total: number
}

export interface GhProjectsReadServiceDeps {
  db: DatabaseClient
}

const clamp = (value: number | undefined, def: number, max: number): number =>
  Math.min(Math.max(1, value ?? def), max)

const clampOffset = (value: number | undefined): number => Math.max(0, value ?? 0)

/**
 * Confirm the requested repo belongs to the workspace and is not soft-deleted.
 * Returns the row on hit, null on miss / cross-org / soft-deleted. Callers
 * map null to 404 at the API layer.
 */
const findLiveRepo = async (
  db: DatabaseClient,
  organisationId: string,
  repoId: string,
): Promise<GhRepo | null> => {
  const rows = await db
    .select()
    .from(ghRepos)
    .where(and(
      eq(ghRepos.id, repoId),
      eq(ghRepos.organisationId, organisationId),
      isNull(ghRepos.deletedAt),
    ))
    .limit(1)
  return rows[0] ?? null
}

export const createGhProjectsReadService = (deps: GhProjectsReadServiceDeps) => {
  const { db } = deps

  // ─── repos ───────────────────────────────────────────────────────────────

  const listRepos = async (args: ListReposArgs): Promise<ListReposResult> => {
    const limit = clamp(args.pagination?.limit, REPOS_LIST_DEFAULT_LIMIT, REPOS_LIST_MAX_LIMIT)
    const offset = clampOffset(args.pagination?.offset)
    const filter = args.filter ?? {}

    const conds = [eq(ghRepos.organisationId, args.organisationId)]
    if (!filter.includeDeleted)
      conds.push(isNull(ghRepos.deletedAt))
    if (typeof filter.tracked === 'boolean')
      conds.push(eq(ghRepos.tracked, filter.tracked))
    if (filter.q && filter.q.trim().length > 0) {
      const needle = `%${filter.q.trim()}%`
      const orClause = or(
        ilike(ghRepos.fullName, needle),
        ilike(ghRepos.description, needle),
      )
      if (orClause)
        conds.push(orClause)
    }

    const where = and(...conds)

    const rows = await db
      .select()
      .from(ghRepos)
      .where(where)
      .orderBy(desc(ghRepos.updatedAt), desc(ghRepos.id))
      .limit(limit)
      .offset(offset)

    const totalRows = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(ghRepos)
      .where(where)
    const total = totalRows[0]?.count ?? 0

    return { rows, total }
  }

  const getRepo = async (args: GetRepoArgs): Promise<GhRepo | null> => {
    return findLiveRepo(db, args.organisationId, args.repoId)
  }

  // ─── issues ──────────────────────────────────────────────────────────────

  const buildIssueOrder = (sort: ListIssuesArgs['sort']) => {
    switch (sort) {
      case 'createdAt:asc':
        return [asc(ghIssues.ghCreatedAt), asc(ghIssues.id)]
      case 'updatedAt:desc':
        return [desc(ghIssues.ghUpdatedAt), desc(ghIssues.id)]
      case 'updatedAt:asc':
        return [asc(ghIssues.ghUpdatedAt), asc(ghIssues.id)]
      case 'createdAt:desc':
      default:
        return [desc(ghIssues.ghCreatedAt), desc(ghIssues.id)]
    }
  }

  const listIssues = async (args: ListIssuesArgs): Promise<ListIssuesResult | null> => {
    const repo = await findLiveRepo(db, args.organisationId, args.repoId)
    if (!repo)
      return null

    const limit = clamp(args.pagination?.limit, ISSUES_LIST_DEFAULT_LIMIT, ISSUES_LIST_MAX_LIMIT)
    const offset = clampOffset(args.pagination?.offset)
    const filter = args.filter ?? {}
    const state = filter.state ?? 'open'

    const conds = [
      eq(ghIssues.organisationId, args.organisationId),
      eq(ghIssues.repoId, repo.id),
    ]
    if (state !== 'all')
      conds.push(eq(ghIssues.state, state))
    if (filter.q && filter.q.trim().length > 0)
      conds.push(ilike(ghIssues.title, `%${filter.q.trim()}%`))
    if (filter.labels && filter.labels.length > 0) {
      // Any-of label match: `labels` is a jsonb array of strings. We can't use
      // the postgres `?|` operator with a parameter array because the driver
      // binds it as a record; instead we OR a `jsonb @> [v]` check per label,
      // which is index-friendly and parameter-safe.
      const orParts = filter.labels.map(label => sql`${ghIssues.labels} @> ${JSON.stringify([label])}::jsonb`)
      const labelOr = orParts.reduce((acc, part, i) => i === 0 ? part : sql`${acc} OR ${part}`)
      conds.push(sql`(${labelOr})`)
    }

    const where = and(...conds)

    const orderBy = buildIssueOrder(args.sort)

    const rows = await db
      .select()
      .from(ghIssues)
      .where(where)
      .orderBy(...orderBy)
      .limit(limit)
      .offset(offset)

    const totalRows = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(ghIssues)
      .where(where)
    const total = totalRows[0]?.count ?? 0

    return { rows, total }
  }

  // ─── pulls ───────────────────────────────────────────────────────────────

  const buildPullOrder = (sort: ListPullsArgs['sort']) => {
    switch (sort) {
      case 'createdAt:asc':
        return [asc(ghPulls.ghCreatedAt), asc(ghPulls.id)]
      case 'updatedAt:desc':
        return [desc(ghPulls.ghUpdatedAt), desc(ghPulls.id)]
      case 'updatedAt:asc':
        return [asc(ghPulls.ghUpdatedAt), asc(ghPulls.id)]
      case 'createdAt:desc':
      default:
        return [desc(ghPulls.ghCreatedAt), desc(ghPulls.id)]
    }
  }

  const listPulls = async (args: ListPullsArgs): Promise<ListPullsResult | null> => {
    const repo = await findLiveRepo(db, args.organisationId, args.repoId)
    if (!repo)
      return null

    const limit = clamp(args.pagination?.limit, PULLS_LIST_DEFAULT_LIMIT, PULLS_LIST_MAX_LIMIT)
    const offset = clampOffset(args.pagination?.offset)
    const filter = args.filter ?? {}
    const state = filter.state ?? 'open'

    const conds = [
      eq(ghPulls.organisationId, args.organisationId),
      eq(ghPulls.repoId, repo.id),
    ]
    if (state !== 'all') {
      // `closed` covers closed-without-merge only; `merged` is a distinct enum
      // value in `gh_pulls.state`. The "all closed" set is `closed` ∪ `merged`,
      // expressed as `inArray` for clarity.
      if (state === 'closed')
        conds.push(eq(ghPulls.state, 'closed'))
      else if (state === 'merged')
        conds.push(eq(ghPulls.state, 'merged'))
      else
        conds.push(eq(ghPulls.state, state))
    }
    if (filter.q && filter.q.trim().length > 0)
      conds.push(ilike(ghPulls.title, `%${filter.q.trim()}%`))
    if (filter.labels && filter.labels.length > 0) {
      const orParts = filter.labels.map(label => sql`${ghPulls.labels} @> ${JSON.stringify([label])}::jsonb`)
      const labelOr = orParts.reduce((acc, part, i) => i === 0 ? part : sql`${acc} OR ${part}`)
      conds.push(sql`(${labelOr})`)
    }

    const where = and(...conds)

    const orderBy = buildPullOrder(args.sort)

    const rows = await db
      .select()
      .from(ghPulls)
      .where(where)
      .orderBy(...orderBy)
      .limit(limit)
      .offset(offset)

    const totalRows = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(ghPulls)
      .where(where)
    const total = totalRows[0]?.count ?? 0

    return { rows, total }
  }

  // ─── commits ─────────────────────────────────────────────────────────────

  const listCommits = async (args: ListCommitsArgs): Promise<ListCommitsResult | null> => {
    const repo = await findLiveRepo(db, args.organisationId, args.repoId)
    if (!repo)
      return null

    const limit = clamp(args.pagination?.limit, COMMITS_LIST_DEFAULT_LIMIT, COMMITS_LIST_MAX_LIMIT)
    const offset = clampOffset(args.pagination?.offset)
    const filter = args.filter ?? {}

    const conds = [
      eq(ghCommits.organisationId, args.organisationId),
      eq(ghCommits.repoId, repo.id),
    ]
    if (filter.since)
      conds.push(gte(ghCommits.authoredAt, filter.since))
    if (filter.author && filter.author.trim().length > 0) {
      const needle = filter.author.trim()
      const orClause = or(
        eq(ghCommits.authorLogin, needle),
        ilike(ghCommits.authorName, `%${needle}%`),
        ilike(ghCommits.authorEmail, `%${needle}%`),
      )
      if (orClause)
        conds.push(orClause)
    }

    const where = and(...conds)

    const rows = await db
      .select()
      .from(ghCommits)
      .where(where)
      .orderBy(desc(ghCommits.authoredAt), desc(ghCommits.id))
      .limit(limit)
      .offset(offset)

    const totalRows = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(ghCommits)
      .where(where)
    const total = totalRows[0]?.count ?? 0

    return { rows, total }
  }

  return {
    listRepos,
    getRepo,
    listIssues,
    listPulls,
    listCommits,
  }
}

export type GhProjectsReadService = ReturnType<typeof createGhProjectsReadService>
