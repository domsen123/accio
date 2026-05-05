/**
 * Pinia Colada queries + mutations for repos (T-4.8).
 *
 * `useGhRepos(params)` watches the params getter and re-fetches on change.
 * `useGhAccessibleRepos()` calls the live `?source=github` endpoint for the
 * picker UI. Mutations centralise invalidation so list + detail stay
 * coherent.
 */
import type { MaybeRefOrGetter } from 'vue'
import type {
  Repo,
  RepoPatchInput,
  ReposListCacheQuery,
  RepoSyncResponse,
  RepoTrackInput,
} from '../types/projects.types'
import { useMutation, useQuery, useQueryCache } from '@pinia/colada'
import { computed, toValue } from 'vue'
import { ghReposKeys, useGhReposApi } from '../api/repos'

export const useGhRepos = (
  params: MaybeRefOrGetter<ReposListCacheQuery> = () => ({}),
) => {
  const api = useGhReposApi()

  const query = useQuery({
    key: () => ghReposKeys.cache(toValue(params)),
    query: () => api.listCache(toValue(params)),
    staleTime: 15 * 1000,
  })

  const rows = computed<Repo[]>(() => query.data.value?.rows ?? [])
  const total = computed(() => query.data.value?.total ?? 0)
  const limit = computed(() => query.data.value?.limit ?? 50)
  const offset = computed(() => query.data.value?.offset ?? 0)

  return {
    ...query,
    rows,
    total,
    limit,
    offset,
  }
}

export const useGhAccessibleRepos = (
  enabled: MaybeRefOrGetter<boolean> = () => true,
) => {
  const api = useGhReposApi()

  const query = useQuery({
    key: ghReposKeys.github(),
    query: () => api.listGithub(),
    enabled: () => Boolean(toValue(enabled)),
    staleTime: 30 * 1000,
  })

  const repos = computed(() => query.data.value?.repos ?? [])

  return {
    ...query,
    repos,
  }
}

export const useGhRepo = (id: MaybeRefOrGetter<string | null>) => {
  const api = useGhReposApi()

  const query = useQuery({
    key: () => ghReposKeys.detail(toValue(id) ?? ''),
    query: () => api.get(toValue(id) as string),
    enabled: () => Boolean(toValue(id)),
    staleTime: 15 * 1000,
  })

  const repo = computed<Repo | null>(() => query.data.value?.repo ?? null)

  return {
    ...query,
    repo,
  }
}

const invalidateRepoQueries = (
  queryCache: ReturnType<typeof useQueryCache>,
  repoId?: string,
) => {
  queryCache.invalidateQueries({ key: ghReposKeys.all })
  if (repoId)
    queryCache.invalidateQueries({ key: ghReposKeys.detail(repoId) })
}

export const usePatchRepoTracked = () => {
  const queryCache = useQueryCache()
  const api = useGhReposApi()

  return useMutation({
    mutation: ({ repoId, tracked }: { repoId: string, tracked: boolean }) =>
      api.patch(repoId, { tracked } satisfies RepoPatchInput),
    onSuccess: ({ repo }) => {
      invalidateRepoQueries(queryCache, repo.id)
    },
  })
}

export const useDeleteRepo = () => {
  const queryCache = useQueryCache()
  const api = useGhReposApi()

  return useMutation({
    mutation: (repoId: string) => api.delete(repoId).then(res => ({ ...res, repoId })),
    onSuccess: ({ repoId }) => {
      invalidateRepoQueries(queryCache, repoId)
    },
  })
}

export const useSyncRepo = () => {
  const queryCache = useQueryCache()
  const api = useGhReposApi()

  return useMutation({
    mutation: (repoId: string): Promise<RepoSyncResponse> => api.sync(repoId),
    onSuccess: ({ repo }) => {
      invalidateRepoQueries(queryCache, repo.id)
    },
  })
}

/**
 * Track or untrack a repo by `(owner, name)`. Used by the picker for rows
 * that may not have a local `gh_repos.id` yet — the server-side
 * `setRepoTracked` inserts a stub on first track.
 */
export const useTrackRepoByName = () => {
  const queryCache = useQueryCache()
  const api = useGhReposApi()

  return useMutation({
    mutation: (input: RepoTrackInput) => api.track(input),
    onSuccess: () => {
      // The picker reads from the github endpoint and overlays cache — both
      // need to refetch after a track toggle.
      queryCache.invalidateQueries({ key: ghReposKeys.all })
    },
  })
}
