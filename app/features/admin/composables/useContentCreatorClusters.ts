import type { MaybeRefOrGetter } from 'vue'
import type { ContentCreatorClustersQueryParams } from '../types/admin.types'
import { useQuery } from '@pinia/colada'
import { useAdminApi } from '../api/admin.api'
import { adminKeys } from '../api/admin.keys'

export const useContentCreatorClusters = (params?: MaybeRefOrGetter<ContentCreatorClustersQueryParams | undefined>) => {
  const adminApi = useAdminApi()

  const query = useQuery({
    key: () => adminKeys.contentCreatorClusters(toValue(params)),
    query: () => adminApi.getContentCreatorClusters(toValue(params)),
    staleTime: 2 * 60 * 1000,
  })

  const clusters = computed(() => query.data.value?.clusters ?? [])
  const total = computed(() => query.data.value?.total ?? 0)

  return {
    ...query,
    clusters,
    total,
  }
}
