import type { MaybeRefOrGetter } from 'vue'
import { useQuery } from '@pinia/colada'
import { useAdminApi } from '../api/admin.api'
import { adminKeys } from '../api/admin.keys'

export const useContentCreatorPillars = (params?: MaybeRefOrGetter<{ status?: string } | undefined>) => {
  const adminApi = useAdminApi()

  const query = useQuery({
    key: () => adminKeys.contentCreatorPillars(toValue(params)),
    query: () => adminApi.getContentCreatorPillars(toValue(params)),
    staleTime: 2 * 60 * 1000,
  })

  const pillars = computed(() => query.data.value?.pillars ?? [])
  const total = computed(() => query.data.value?.total ?? 0)

  return {
    ...query,
    pillars,
    total,
  }
}
