import type { MaybeRefOrGetter } from 'vue'
import { useQuery } from '@pinia/colada'
import { useAdminApi } from '../api/admin.api'
import { adminKeys } from '../api/admin.keys'

export const useAdminTeam = (id: MaybeRefOrGetter<string>) => {
  const adminApi = useAdminApi()

  const query = useQuery({
    key: () => adminKeys.team(toValue(id)),
    query: () => adminApi.getTeam(toValue(id)),
    staleTime: 2 * 60 * 1000, // 2 minutes
  })

  const team = computed(() => query.data.value?.team ?? null)

  return {
    ...query,
    team,
  }
}
