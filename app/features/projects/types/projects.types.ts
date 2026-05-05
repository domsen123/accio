/**
 * Client-side types for the GitHub projects feature (T-4.8).
 *
 * Mirrors the server's serialiser output — see
 * `server/features/projects/api-schemas.ts`. All `Date` instances are emitted
 * as ISO strings on the wire, so every timestamp on this side is `string`.
 */

// ─── Connection ────────────────────────────────────────────────────────────

export interface ConnectionStatus {
  connected: boolean
  ghUserLogin?: string
  ghUserId?: number
  scopes?: string[]
  lastValidatedAt?: string | null
  updatedAt?: string | null
}

export interface ConnectionConnectInput {
  token: string
}

export interface ConnectionConnectResult {
  connected: true
  ghUserLogin: string
  ghUserId: number
  scopes: string[]
}

export type ConnectionValidateResult
  = | { valid: true, ghUserLogin: string, ghUserId: number, scopes: string[] }
    | { valid: false, reason: 'no_connection' | 'invalid_token' | 'insufficient_scope' | 'validation_failed' }

export interface ConnectionRevokeResult {
  ok: true
  purged: boolean
}

// ─── Repos ─────────────────────────────────────────────────────────────────

export interface Repo {
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

export interface AccessibleRepo {
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

export interface ReposListCacheQuery {
  source?: 'cache'
  tracked?: boolean
  q?: string
  includeDeleted?: boolean
  limit?: number
  offset?: number
}

export interface ReposListGithubQuery {
  source: 'github'
}

export type ReposListQuery = ReposListCacheQuery | ReposListGithubQuery

export interface ReposListCacheResponse {
  rows: Repo[]
  total: number
  limit: number
  offset: number
}

export interface ReposListGithubResponse {
  repos: AccessibleRepo[]
}

export interface RepoDetailResponse {
  repo: Repo
}

export interface RepoSyncResponse {
  repo: Repo
  counts: {
    issues: number
    pulls: number
    commits: number
  }
}

// ─── Issues / Pulls / Commits ──────────────────────────────────────────────

export interface GhUserRef {
  login: string
  id?: number
  avatarUrl?: string | null
}

export interface Issue {
  id: string
  organisationId: string
  repoId: string
  ghId: number
  number: number
  title: string
  body: string | null
  state: 'open' | 'closed'
  stateReason: string | null
  labels: string[]
  assignees: GhUserRef[]
  author: GhUserRef
  commentsCount: number
  ghCreatedAt: string | null
  ghUpdatedAt: string | null
  ghClosedAt: string | null
  htmlUrl: string
  createdAt: string
  updatedAt: string
}

export interface Pull {
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
  labels: string[]
  assignees: GhUserRef[]
  requestedReviewers: GhUserRef[]
  author: GhUserRef
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

export interface Commit {
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
  parents: string[]
  createdAt: string
  updatedAt: string
}

export type IssueSort
  = | 'createdAt:desc'
    | 'createdAt:asc'
    | 'updatedAt:desc'
    | 'updatedAt:asc'

export interface IssuesListQuery {
  state?: 'open' | 'closed' | 'all'
  labels?: string[]
  q?: string
  limit?: number
  offset?: number
  sort?: IssueSort
}

export interface PullsListQuery {
  state?: 'open' | 'closed' | 'merged' | 'all'
  labels?: string[]
  q?: string
  limit?: number
  offset?: number
  sort?: IssueSort
}

export interface CommitsListQuery {
  since?: string
  author?: string
  limit?: number
  offset?: number
}

export interface PaginatedResponse<T> {
  rows: T[]
  total: number
  limit: number
  offset: number
}

export type IssuesListResponse = PaginatedResponse<Issue>
export type PullsListResponse = PaginatedResponse<Pull>
export type CommitsListResponse = PaginatedResponse<Commit>

export interface RepoPatchInput {
  tracked: boolean
}

export interface RepoTrackInput {
  owner: string
  name: string
  tracked: boolean
}
