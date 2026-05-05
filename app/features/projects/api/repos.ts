/**
 * Typed `$fetch` wrappers for the projects repos API (T-4.8, T-4.6).
 *
 * One module covers the whole repo surface: list (cache + github sources),
 * detail, patch, delete, sync, plus the three child queries
 * (issues / pulls / commits). Query serialisation is centralised here so the
 * composables stay declarative.
 */
import type {
  CommitsListQuery,
  CommitsListResponse,
  IssuesListQuery,
  IssuesListResponse,
  PullsListQuery,
  PullsListResponse,
  RepoDetailResponse,
  RepoPatchInput,
  ReposListCacheQuery,
  ReposListCacheResponse,
  ReposListGithubResponse,
  RepoSyncResponse,
} from '../types/projects.types'

const buildCacheListQuery = (params: ReposListCacheQuery): Record<string, unknown> => {
  const q: Record<string, unknown> = { source: 'cache' }
  if (typeof params.tracked === 'boolean')
    q.tracked = params.tracked ? '1' : '0'
  if (params.q)
    q.q = params.q
  if (typeof params.includeDeleted === 'boolean')
    q.includeDeleted = params.includeDeleted ? '1' : '0'
  if (typeof params.limit === 'number')
    q.limit = params.limit
  if (typeof params.offset === 'number')
    q.offset = params.offset
  return q
}

const buildIssuesQuery = (p: IssuesListQuery): Record<string, unknown> => {
  const q: Record<string, unknown> = {}
  if (p.state)
    q.state = p.state
  if (p.labels && p.labels.length > 0)
    q.labels = p.labels
  if (p.q)
    q.q = p.q
  if (typeof p.limit === 'number')
    q.limit = p.limit
  if (typeof p.offset === 'number')
    q.offset = p.offset
  if (p.sort)
    q.sort = p.sort
  return q
}

const buildPullsQuery = (p: PullsListQuery): Record<string, unknown> => {
  const q: Record<string, unknown> = {}
  if (p.state)
    q.state = p.state
  if (p.labels && p.labels.length > 0)
    q.labels = p.labels
  if (p.q)
    q.q = p.q
  if (typeof p.limit === 'number')
    q.limit = p.limit
  if (typeof p.offset === 'number')
    q.offset = p.offset
  if (p.sort)
    q.sort = p.sort
  return q
}

const buildCommitsQuery = (p: CommitsListQuery): Record<string, unknown> => {
  const q: Record<string, unknown> = {}
  if (p.since)
    q.since = p.since
  if (p.author)
    q.author = p.author
  if (typeof p.limit === 'number')
    q.limit = p.limit
  if (typeof p.offset === 'number')
    q.offset = p.offset
  return q
}

export const useGhReposApi = () => {
  const { $api } = useNuxtApp()

  return {
    listCache: (params: ReposListCacheQuery = {}): Promise<ReposListCacheResponse> =>
      $api('/api/projects/repos', { query: buildCacheListQuery(params) }),

    listGithub: (): Promise<ReposListGithubResponse> =>
      $api('/api/projects/repos', { query: { source: 'github' } }),

    get: (repoId: string): Promise<RepoDetailResponse> =>
      $api(String(`/api/projects/repos/${repoId}`)),

    patch: (repoId: string, input: RepoPatchInput): Promise<RepoDetailResponse> =>
      $api(String(`/api/projects/repos/${repoId}`), {
        method: 'PATCH',
        body: input,
      }),

    delete: (repoId: string): Promise<{ ok: true }> =>
      $api(String(`/api/projects/repos/${repoId}`), { method: 'DELETE' }),

    sync: (repoId: string): Promise<RepoSyncResponse> =>
      $api(String(`/api/projects/repos/${repoId}/sync`), { method: 'POST' }),

    listIssues: (repoId: string, params: IssuesListQuery = {}): Promise<IssuesListResponse> =>
      $api(String(`/api/projects/repos/${repoId}/issues`), { query: buildIssuesQuery(params) }),

    listPulls: (repoId: string, params: PullsListQuery = {}): Promise<PullsListResponse> =>
      $api(String(`/api/projects/repos/${repoId}/pulls`), { query: buildPullsQuery(params) }),

    listCommits: (repoId: string, params: CommitsListQuery = {}): Promise<CommitsListResponse> =>
      $api(String(`/api/projects/repos/${repoId}/commits`), { query: buildCommitsQuery(params) }),
  }
}

export const ghReposKeys = {
  all: ['projects', 'repos'] as const,
  cache: (params: ReposListCacheQuery) =>
    ['projects', 'repos', 'cache', params] as const,
  github: () => ['projects', 'repos', 'github'] as const,
  detail: (id: string) => ['projects', 'repos', 'detail', id] as const,
  issues: (id: string, params: IssuesListQuery) =>
    ['projects', 'repos', id, 'issues', params] as const,
  pulls: (id: string, params: PullsListQuery) =>
    ['projects', 'repos', id, 'pulls', params] as const,
  commits: (id: string, params: CommitsListQuery) =>
    ['projects', 'repos', id, 'commits', params] as const,
}
