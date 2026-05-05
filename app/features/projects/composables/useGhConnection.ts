/**
 * Pinia Colada queries + mutations for the GitHub connection (T-4.8).
 *
 * Mirrors `useConversations.ts` from the orchestrator slice — `useQuery` for
 * status, `useMutation` for connect / revoke / validate, and a shared
 * `invalidate` so list/detail caches stay coherent after writes.
 */
import type {
  ConnectionConnectInput,
  ConnectionConnectResult,
  ConnectionRevokeResult,
  ConnectionStatus,
  ConnectionValidateResult,
} from '../types/projects.types'
import { useMutation, useQuery, useQueryCache } from '@pinia/colada'
import { computed } from 'vue'
import { ghConnectionKeys, useGhConnectionApi } from '../api/connection'
import { ghReposKeys } from '../api/repos'

const invalidateAll = (queryCache: ReturnType<typeof useQueryCache>) => {
  queryCache.invalidateQueries({ key: ghConnectionKeys.all })
  queryCache.invalidateQueries({ key: ghReposKeys.all })
}

export const useGhConnection = () => {
  const api = useGhConnectionApi()

  const query = useQuery({
    key: ghConnectionKeys.status(),
    query: () => api.getStatus(),
    staleTime: 30 * 1000,
  })

  const status = computed<ConnectionStatus | null>(() => query.data.value ?? null)
  const isConnected = computed(() => Boolean(query.data.value?.connected))

  return {
    ...query,
    status,
    isConnected,
  }
}

export const useConnectGh = () => {
  const queryCache = useQueryCache()
  const api = useGhConnectionApi()

  return useMutation({
    mutation: (input: ConnectionConnectInput): Promise<ConnectionConnectResult> =>
      api.connect(input),
    onSuccess: () => {
      invalidateAll(queryCache)
    },
  })
}

export const useRevokeGh = () => {
  const queryCache = useQueryCache()
  const api = useGhConnectionApi()

  return useMutation({
    mutation: ({ purgeData }: { purgeData: boolean }): Promise<ConnectionRevokeResult> =>
      api.revoke(purgeData),
    onSuccess: () => {
      invalidateAll(queryCache)
    },
  })
}

export const useValidateGh = () => {
  const queryCache = useQueryCache()
  const api = useGhConnectionApi()

  return useMutation({
    mutation: (): Promise<ConnectionValidateResult> => api.validate(),
    onSuccess: () => {
      queryCache.invalidateQueries({ key: ghConnectionKeys.all })
    },
  })
}
