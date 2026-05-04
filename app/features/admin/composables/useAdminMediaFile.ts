import type { MaybeRefOrGetter } from 'vue'
import { useQuery } from '@pinia/colada'
import { useAdminApi } from '../api/admin.api'
import { adminKeys } from '../api/admin.keys'

export const useAdminMediaFile = (id: MaybeRefOrGetter<string>) => {
  const adminApi = useAdminApi()

  const query = useQuery({
    key: () => adminKeys.mediaFile(toValue(id)),
    query: () => adminApi.getMediaFile(toValue(id)),
    staleTime: 2 * 60 * 1000,
  })

  const file = computed(() => query.data.value?.file ?? null)

  return {
    ...query,
    file,
  }
}
