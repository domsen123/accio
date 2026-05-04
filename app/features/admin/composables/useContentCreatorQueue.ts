import { useMutation, useQuery, useQueryCache } from '@pinia/colada'
import { useAdminApi } from '../api/admin.api'
import { adminKeys } from '../api/admin.keys'

export const useContentCreatorQueue = () => {
  const adminApi = useAdminApi()

  const query = useQuery({
    key: () => adminKeys.contentCreatorQueue(),
    query: () => adminApi.getContentCreatorQueue(),
    staleTime: 30 * 1000,
  })

  const queue = computed(() => query.data.value?.queue ?? [])

  return {
    ...query,
    queue,
  }
}

export const useProcessContentCreatorQueue = () => {
  const queryCache = useQueryCache()
  const adminApi = useAdminApi()

  return useMutation({
    mutation: () => adminApi.processContentCreatorQueue(),
    onSettled: () => {
      queryCache.invalidateQueries({ key: adminKeys.contentCreatorQueue() })
      queryCache.invalidateQueries({ key: adminKeys.contentCreatorClusters() })
      queryCache.invalidateQueries({ key: adminKeys.blogPosts() })
    },
  })
}
