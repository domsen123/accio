/**
 * Zod v4 query/body schemas + JSON serialisers for the projects API (T-4.6).
 *
 * Mirrors `server/features/orchestrator/audit-schemas.ts`:
 *   - Repeatable params normalise via `z.preprocess`.
 *   - ISO date bounds use `z.preprocess` + `datetime({ offset: true })`.
 *   - Serialisers convert `Date` → ISO string and preserve nulls so no
 *     `Date` instance crosses the wire.
 */
import type {
  GhCommit,
  GhConnection,
  GhIssue,
  GhPull,
  GhRepo,
} from '../../database/schema'
import { z } from 'zod'
import {
  COMMITS_LIST_MAX_LIMIT,
  ISSUES_LIST_MAX_LIMIT,
  PULLS_LIST_MAX_LIMIT,
  REPOS_LIST_MAX_LIMIT,
} from './read.service'

// ─── Shared helpers ─────────────────────────────────────────────────────────

const repeatable = z.preprocess(
  (v) => {
    if (v == null || v === '')
      return undefined
    if (Array.isArray(v))
      return v
    return [v]
  },
  z.array(z.string().trim().min(1)).optional(),
)

const isoDate = z.preprocess(
  (v) => {
    if (typeof v !== 'string' || v.trim() === '')
      return undefined
    return v
  },
  z.string().datetime({ offset: true }).optional(),
)

const boolish = z.preprocess(
  (v) => {
    if (v === undefined || v === null || v === '')
      return undefined
    if (typeof v === 'boolean')
      return v
    if (typeof v === 'string') {
      const lower = v.trim().toLowerCase()
      if (lower === 'true' || lower === '1')
        return true
      if (lower === 'false' || lower === '0')
        return false
    }
    return v
  },
  z.boolean().optional(),
)

// ─── Connection ─────────────────────────────────────────────────────────────

export const connectBodySchema = z.object({
  token: z.string().trim().min(1),
})

export const revokeQuerySchema = z.object({
  purgeData: boolish,
})

// ─── Repos ──────────────────────────────────────────────────────────────────

export const reposListQuerySchema = z.object({
  source: z.enum(['cache', 'github']).optional(),
  tracked: boolish,
  q: z.string().trim().min(1).max(200).optional(),
  includeDeleted: boolish,
  limit: z.coerce.number().int().min(1).max(REPOS_LIST_MAX_LIMIT).optional(),
  offset: z.coerce.number().int().min(0).optional(),
})

export type ReposListQuery = z.infer<typeof reposListQuerySchema>

export const repoPatchBodySchema = z.object({
  tracked: z.boolean(),
}).strict()

export type RepoPatchBody = z.infer<typeof repoPatchBodySchema>

export const repoTrackBodySchema = z.object({
  owner: z.string().trim().min(1).max(200),
  name: z.string().trim().min(1).max(200),
  tracked: z.boolean(),
}).strict()

export type RepoTrackBody = z.infer<typeof repoTrackBodySchema>

// ─── Issues ─────────────────────────────────────────────────────────────────

export const issuesListQuerySchema = z.object({
  state: z.enum(['open', 'closed', 'all']).optional(),
  labels: repeatable,
  q: z.string().trim().min(1).max(200).optional(),
  limit: z.coerce.number().int().min(1).max(ISSUES_LIST_MAX_LIMIT).optional(),
  offset: z.coerce.number().int().min(0).optional(),
  sort: z.enum([
    'createdAt:desc',
    'createdAt:asc',
    'updatedAt:desc',
    'updatedAt:asc',
  ]).optional(),
})

export type IssuesListQuery = z.infer<typeof issuesListQuerySchema>

// ─── Pulls ──────────────────────────────────────────────────────────────────

export const pullsListQuerySchema = z.object({
  state: z.enum(['open', 'closed', 'merged', 'all']).optional(),
  labels: repeatable,
  q: z.string().trim().min(1).max(200).optional(),
  limit: z.coerce.number().int().min(1).max(PULLS_LIST_MAX_LIMIT).optional(),
  offset: z.coerce.number().int().min(0).optional(),
  sort: z.enum([
    'createdAt:desc',
    'createdAt:asc',
    'updatedAt:desc',
    'updatedAt:asc',
  ]).optional(),
})

export type PullsListQuery = z.infer<typeof pullsListQuerySchema>

// ─── Commits ────────────────────────────────────────────────────────────────

export const commitsListQuerySchema = z.object({
  since: isoDate,
  author: z.string().trim().min(1).max(200).optional(),
  limit: z.coerce.number().int().min(1).max(COMMITS_LIST_MAX_LIMIT).optional(),
  offset: z.coerce.number().int().min(0).optional(),
})

export type CommitsListQuery = z.infer<typeof commitsListQuerySchema>

// ─── Serialisers ────────────────────────────────────────────────────────────

const toIso = (d: Date | null | undefined): string | null =>
  d ? d.toISOString() : null

export interface SerialisedConnectionStatus {
  connected: boolean
  ghUserLogin?: string
  ghUserId?: number
  scopes?: string[]
  lastValidatedAt?: string | null
  updatedAt?: string | null
}

export const serialiseConnectionStatus = (
  status: {
    connected: boolean
    ghUserLogin?: string
    ghUserId?: number
    scopes?: string[]
    lastValidatedAt?: Date | null
    updatedAt?: Date | null
  },
): SerialisedConnectionStatus => {
  if (!status.connected)
    return { connected: false }
  return {
    connected: true,
    ghUserLogin: status.ghUserLogin,
    ghUserId: status.ghUserId,
    scopes: status.scopes ?? [],
    lastValidatedAt: toIso(status.lastValidatedAt ?? null),
    updatedAt: toIso(status.updatedAt ?? null),
  }
}

export interface SerialisedRepo {
  id: string
  organisationId: string
  connectionId: string | null
  ghId: number
  owner: string
  name: string
  fullName: string
  defaultBranch: string | null
  private: boolean
  description: string | null
  tracked: boolean
  lastSyncedAt: string | null
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}

export const serialiseRepo = (row: GhRepo): SerialisedRepo => ({
  id: row.id,
  organisationId: row.organisationId,
  connectionId: row.connectionId,
  ghId: row.ghId,
  owner: row.owner,
  name: row.name,
  fullName: row.fullName,
  defaultBranch: row.defaultBranch,
  private: row.private,
  description: row.description,
  tracked: row.tracked,
  lastSyncedAt: toIso(row.lastSyncedAt),
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
  deletedAt: toIso(row.deletedAt),
})

export interface SerialisedAccessibleRepo {
  ghId: number
  owner: string
  name: string
  fullName: string
  description: string | null
  private: boolean
  htmlUrl: string
  defaultBranch: string | null
  ghCreatedAt: string | null
  ghUpdatedAt: string | null
  isCached: boolean
  isTracked: boolean
  lastSyncedAt: string | null
}

export const serialiseAccessibleRepo = (row: {
  ghId: number
  owner: string
  name: string
  fullName: string
  description: string | null
  private: boolean
  htmlUrl: string
  defaultBranch: string | null
  ghCreatedAt: Date | null
  ghUpdatedAt: Date | null
  isCached: boolean
  isTracked: boolean
  lastSyncedAt: Date | null
}): SerialisedAccessibleRepo => ({
  ghId: row.ghId,
  owner: row.owner,
  name: row.name,
  fullName: row.fullName,
  description: row.description,
  private: row.private,
  htmlUrl: row.htmlUrl,
  defaultBranch: row.defaultBranch,
  ghCreatedAt: toIso(row.ghCreatedAt),
  ghUpdatedAt: toIso(row.ghUpdatedAt),
  isCached: row.isCached,
  isTracked: row.isTracked,
  lastSyncedAt: toIso(row.lastSyncedAt),
})

export interface SerialisedIssue {
  id: string
  organisationId: string
  repoId: string
  ghId: number
  number: number
  title: string
  body: string | null
  state: 'open' | 'closed'
  stateReason: string | null
  labels: unknown
  assignees: unknown
  author: unknown
  commentsCount: number
  ghCreatedAt: string | null
  ghUpdatedAt: string | null
  ghClosedAt: string | null
  htmlUrl: string
  createdAt: string
  updatedAt: string
}

export const serialiseIssue = (row: GhIssue): SerialisedIssue => ({
  id: row.id,
  organisationId: row.organisationId,
  repoId: row.repoId,
  ghId: row.ghId,
  number: row.number,
  title: row.title,
  body: row.body,
  state: row.state,
  stateReason: row.stateReason,
  labels: row.labels,
  assignees: row.assignees,
  author: row.author,
  commentsCount: row.commentsCount,
  ghCreatedAt: toIso(row.ghCreatedAt),
  ghUpdatedAt: toIso(row.ghUpdatedAt),
  ghClosedAt: toIso(row.ghClosedAt),
  htmlUrl: row.htmlUrl,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
})

export interface SerialisedPull {
  id: string
  organisationId: string
  repoId: string
  ghId: number
  number: number
  title: string
  body: string | null
  state: 'open' | 'closed' | 'merged'
  draft: boolean
  baseRef: string
  headRef: string
  labels: unknown
  assignees: unknown
  requestedReviewers: unknown
  author: unknown
  commentsCount: number
  additions: number | null
  deletions: number | null
  changedFiles: number | null
  ghCreatedAt: string | null
  ghUpdatedAt: string | null
  ghClosedAt: string | null
  ghMergedAt: string | null
  htmlUrl: string
  createdAt: string
  updatedAt: string
}

export const serialisePull = (row: GhPull): SerialisedPull => ({
  id: row.id,
  organisationId: row.organisationId,
  repoId: row.repoId,
  ghId: row.ghId,
  number: row.number,
  title: row.title,
  body: row.body,
  state: row.state,
  draft: row.draft,
  baseRef: row.baseRef,
  headRef: row.headRef,
  labels: row.labels,
  assignees: row.assignees,
  requestedReviewers: row.requestedReviewers,
  author: row.author,
  commentsCount: row.commentsCount,
  additions: row.additions,
  deletions: row.deletions,
  changedFiles: row.changedFiles,
  ghCreatedAt: toIso(row.ghCreatedAt),
  ghUpdatedAt: toIso(row.ghUpdatedAt),
  ghClosedAt: toIso(row.ghClosedAt),
  ghMergedAt: toIso(row.ghMergedAt),
  htmlUrl: row.htmlUrl,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
})

export interface SerialisedCommit {
  id: string
  organisationId: string
  repoId: string
  sha: string
  message: string
  authorName: string | null
  authorEmail: string | null
  authorLogin: string | null
  authorAvatarUrl: string | null
  authoredAt: string | null
  committerLogin: string | null
  committedAt: string | null
  htmlUrl: string
  parents: unknown
  createdAt: string
  updatedAt: string
}

export const serialiseCommit = (row: GhCommit): SerialisedCommit => ({
  id: row.id,
  organisationId: row.organisationId,
  repoId: row.repoId,
  sha: row.sha,
  message: row.message,
  authorName: row.authorName,
  authorEmail: row.authorEmail,
  authorLogin: row.authorLogin,
  authorAvatarUrl: row.authorAvatarUrl,
  authoredAt: toIso(row.authoredAt),
  committerLogin: row.committerLogin,
  committedAt: toIso(row.committedAt),
  htmlUrl: row.htmlUrl,
  parents: row.parents,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
})

// keep referenced (avoids unused-import warnings with verbose downstream)
export type { GhConnection }
