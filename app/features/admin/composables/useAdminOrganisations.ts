import type { MaybeRefOrGetter } from 'vue'
import type { AdminOrganisationsQueryParams } from '../types/admin.types'
import { useQuery } from '@pinia/colada'
import { useAdminApi } from '../api/admin.api'
import { adminKeys } from '../api/admin.keys'

export const useAdminOrganisations = (params?: MaybeRefOrGetter<AdminOrganisationsQueryParams>) => {
  const adminApi = useAdminApi()

  const query = useQuery({
    key: () => adminKeys.organisations(toValue(params)),
    query: () => adminApi.getOrganisations(toValue(params)),
    staleTime: 2 * 60 * 1000, // 2 minutes
  })

  const organisations = computed(() =>
    query.data.value?.organisations ?? [],
  )

  const total = computed(() =>
    query.data.value?.total ?? 0,
  )

  return {
    ...query,
    organisations,
    total,
  }
}
