import { useMutation, useQueryCache } from '@pinia/colada'
import { useAdminApi } from '../api/admin.api'
import { adminKeys } from '../api/admin.keys'

export const useGenerateContentCreatorPillars = () => {
  const queryCache = useQueryCache()
  const adminApi = useAdminApi()

  return useMutation({
    mutation: (seedTopic: string) => adminApi.generateContentCreatorPillars(seedTopic),
    onSettled: () => {
      queryCache.invalidateQueries({ key: adminKeys.contentCreatorPillars() })
    },
  })
}

export const useUpdateContentCreatorPillar = () => {
  const queryCache = useQueryCache()
  const adminApi = useAdminApi()

  return useMutation({
    mutation: ({ id, action }: { id: string, action: 'confirm' | 'reject' }) =>
      adminApi.updateContentCreatorPillar(id, action),
    onSettled: () => {
      queryCache.invalidateQueries({ key: adminKeys.contentCreatorPillars() })
      queryCache.invalidateQueries({ key: adminKeys.blogCategories() })
    },
  })
}

export const useDeleteContentCreatorPillar = () => {
  const queryCache = useQueryCache()
  const adminApi = useAdminApi()

  return useMutation({
    mutation: (id: string) => adminApi.deleteContentCreatorPillar(id),
    onSettled: () => {
      queryCache.invalidateQueries({ key: adminKeys.contentCreatorPillars() })
    },
  })
}
