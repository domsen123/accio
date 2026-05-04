import type { SaveContentCreatorSettingsInput } from '../types/admin.types'
import { useMutation, useQuery, useQueryCache } from '@pinia/colada'
import { useAdminApi } from '../api/admin.api'
import { adminKeys } from '../api/admin.keys'

export const useContentCreatorSettings = () => {
  const adminApi = useAdminApi()

  const query = useQuery({
    key: () => adminKeys.contentCreatorSettings(),
    query: () => adminApi.getContentCreatorSettings(),
    staleTime: 2 * 60 * 1000,
  })

  const settings = computed(() => query.data.value?.settings ?? null)

  return {
    ...query,
    settings,
  }
}

export const useSaveContentCreatorSettings = () => {
  const queryCache = useQueryCache()
  const adminApi = useAdminApi()

  return useMutation({
    mutation: (data: SaveContentCreatorSettingsInput) => adminApi.saveContentCreatorSettings(data),
    onSettled: () => {
      queryCache.invalidateQueries({ key: adminKeys.contentCreatorSettings() })
    },
  })
}

export const useValidateContentCreatorConnection = () => {
  const adminApi = useAdminApi()

  return useMutation({
    mutation: () => adminApi.validateContentCreatorConnection(),
  })
}
