import type { MaybeRefOrGetter } from 'vue'
import { useQuery } from '@pinia/colada'
import { useAdminApi } from '../api/admin.api'
import { adminKeys } from '../api/admin.keys'

export const useAdminUser = (id: MaybeRefOrGetter<string>) => {
  const adminApi = useAdminApi()

  const query = useQuery({
    key: () => adminKeys.user(toValue(id)),
    query: () => adminApi.getUser(toValue(id)),
    staleTime: 2 * 60 * 1000, // 2 minutes
  })

  const user = computed(() => query.data.value?.user ?? null)

  return {
    ...query,
    user,
  }
}
