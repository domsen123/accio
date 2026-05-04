import type { MaybeRefOrGetter } from 'vue'
import type { AdminUsersQueryParams } from '../types/admin.types'
import { useQuery } from '@pinia/colada'
import { useAdminApi } from '../api/admin.api'
import { adminKeys } from '../api/admin.keys'

export const useAdminUsers = (params?: MaybeRefOrGetter<AdminUsersQueryParams>) => {
  const adminApi = useAdminApi()

  const query = useQuery({
    key: () => adminKeys.users(toValue(params)),
    query: () => adminApi.getUsers(toValue(params)),
    staleTime: 2 * 60 * 1000, // 2 minutes
  })

  const users = computed(() =>
    query.data.value?.users ?? [],
  )

  const total = computed(() =>
    query.data.value?.total ?? 0,
  )

  return {
    ...query,
    users,
    total,
  }
}
