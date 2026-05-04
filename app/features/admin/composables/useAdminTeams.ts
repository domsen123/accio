import type { MaybeRefOrGetter } from 'vue'
import type { AdminTeamsQueryParams } from '../types/admin.types'
import { useQuery } from '@pinia/colada'
import { useAdminApi } from '../api/admin.api'
import { adminKeys } from '../api/admin.keys'

export const useAdminTeams = (params?: MaybeRefOrGetter<AdminTeamsQueryParams>) => {
  const adminApi = useAdminApi()

  const query = useQuery({
    key: () => adminKeys.teams(toValue(params)),
    query: () => adminApi.getTeams(toValue(params)),
    staleTime: 2 * 60 * 1000, // 2 minutes
  })

  const teams = computed(() =>
    query.data.value?.teams ?? [],
  )

  const total = computed(() =>
    query.data.value?.total ?? 0,
  )

  return {
    ...query,
    teams,
    total,
  }
}
