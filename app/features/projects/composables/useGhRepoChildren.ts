/**
 * Pinia Colada queries for issues / pulls / commits (T-4.8).
 *
 * Each composable accepts a reactive `(repoId, params)` pair and re-fetches
 * when either changes. The `enabled` guard prevents firing while `repoId` is
 * still resolving from the route.
 */
import type { MaybeRefOrGetter } from 'vue'
import type {
  CommitsListQuery,
  IssuesListQuery,
  PullsListQuery,
} from '../types/projects.types'
import { useQuery } from '@pinia/colada'
import { computed, toValue } from 'vue'
import { ghReposKeys, useGhReposApi } from '../api/repos'

export const useGhRepoIssues = (
  repoId: MaybeRefOrGetter<string | null>,
  params: MaybeRefOrGetter<IssuesListQuery> = () => ({}),
) => {
  const api = useGhReposApi()

  const query = useQuery({
    key: () => ghReposKeys.issues(toValue(repoId) ?? '', toValue(params)),
    query: () => api.listIssues(toValue(repoId) as string, toValue(params)),
    enabled: () => Boolean(toValue(repoId)),
    staleTime: 15 * 1000,
  })

  const rows = computed(() => query.data.value?.rows ?? [])
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

export const useGhRepoPulls = (
  repoId: MaybeRefOrGetter<string | null>,
  params: MaybeRefOrGetter<PullsListQuery> = () => ({}),
) => {
  const api = useGhReposApi()

  const query = useQuery({
    key: () => ghReposKeys.pulls(toValue(repoId) ?? '', toValue(params)),
    query: () => api.listPulls(toValue(repoId) as string, toValue(params)),
    enabled: () => Boolean(toValue(repoId)),
    staleTime: 15 * 1000,
  })

  const rows = computed(() => query.data.value?.rows ?? [])
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

export const useGhRepoCommits = (
  repoId: MaybeRefOrGetter<string | null>,
  params: MaybeRefOrGetter<CommitsListQuery> = () => ({}),
) => {
  const api = useGhReposApi()

  const query = useQuery({
    key: () => ghReposKeys.commits(toValue(repoId) ?? '', toValue(params)),
    query: () => api.listCommits(toValue(repoId) as string, toValue(params)),
    enabled: () => Boolean(toValue(repoId)),
    staleTime: 15 * 1000,
  })

  const rows = computed(() => query.data.value?.rows ?? [])
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
