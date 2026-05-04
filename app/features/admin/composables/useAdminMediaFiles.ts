import type { MaybeRefOrGetter } from 'vue'
import type { AdminMediaFilesQueryParams } from '../types/admin.types'
import { useQuery } from '@pinia/colada'
import { useAdminApi } from '../api/admin.api'
import { adminKeys } from '../api/admin.keys'

export const useAdminMediaFiles = (params?: MaybeRefOrGetter<AdminMediaFilesQueryParams>) => {
  const adminApi = useAdminApi()

  const query = useQuery({
    key: () => adminKeys.mediaFiles(toValue(params)),
    query: () => adminApi.getMediaFiles(toValue(params)),
    staleTime: 2 * 60 * 1000,
  })

  const files = computed(() =>
    query.data.value?.files ?? [],
  )

  const total = computed(() =>
    query.data.value?.total ?? 0,
  )

  return {
    ...query,
    files,
    total,
  }
}
