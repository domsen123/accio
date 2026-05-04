import type { UpdateClusterInput } from '../types/admin.types'
import { useMutation, useQueryCache } from '@pinia/colada'
import { useAdminApi } from '../api/admin.api'
import { adminKeys } from '../api/admin.keys'

export const useGenerateContentCreatorClusters = () => {
  const queryCache = useQueryCache()
  const adminApi = useAdminApi()

  return useMutation({
    mutation: (pillarId: string) => adminApi.generateContentCreatorClusters(pillarId),
    onSettled: () => {
      queryCache.invalidateQueries({ key: adminKeys.contentCreatorClusters() })
      queryCache.invalidateQueries({ key: adminKeys.contentCreatorPillars() })
    },
  })
}

export const useUpdateContentCreatorCluster = () => {
  const queryCache = useQueryCache()
  const adminApi = useAdminApi()

  return useMutation({
    mutation: ({ id, data }: { id: string, data: UpdateClusterInput }) =>
      adminApi.updateContentCreatorCluster(id, data),
    onSettled: () => {
      queryCache.invalidateQueries({ key: adminKeys.contentCreatorClusters() })
      queryCache.invalidateQueries({ key: adminKeys.contentCreatorQueue() })
    },
  })
}

export const useDeleteContentCreatorCluster = () => {
  const queryCache = useQueryCache()
  const adminApi = useAdminApi()

  return useMutation({
    mutation: (id: string) => adminApi.deleteContentCreatorCluster(id),
    onSettled: () => {
      queryCache.invalidateQueries({ key: adminKeys.contentCreatorClusters() })
      queryCache.invalidateQueries({ key: adminKeys.contentCreatorPillars() })
    },
  })
}

export const useGenerateContentCreatorClusterContent = () => {
  const queryCache = useQueryCache()
  const adminApi = useAdminApi()

  return useMutation({
    mutation: (id: string) => adminApi.generateContentCreatorClusterContent(id),
    onSettled: () => {
      queryCache.invalidateQueries({ key: adminKeys.contentCreatorClusters() })
      queryCache.invalidateQueries({ key: adminKeys.contentCreatorQueue() })
      queryCache.invalidateQueries({ key: adminKeys.blogPosts() })
    },
  })
}
