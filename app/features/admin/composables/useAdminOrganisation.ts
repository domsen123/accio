import type { MaybeRefOrGetter } from 'vue'
import { useQuery } from '@pinia/colada'
import { useAdminApi } from '../api/admin.api'
import { adminKeys } from '../api/admin.keys'

export const useAdminOrganisation = (id: MaybeRefOrGetter<string>) => {
  const adminApi = useAdminApi()

  const query = useQuery({
    key: () => adminKeys.organisation(toValue(id)),
    query: () => adminApi.getOrganisation(toValue(id)),
    staleTime: 2 * 60 * 1000, // 2 minutes
  })

  const organisation = computed(() => query.data.value?.organisation ?? null)

  return {
    ...query,
    organisation,
  }
}
