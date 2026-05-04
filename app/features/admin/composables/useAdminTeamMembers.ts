import type { MaybeRefOrGetter } from 'vue'
import { useQuery } from '@pinia/colada'
import { useAdminApi } from '../api/admin.api'
import { adminKeys } from '../api/admin.keys'

export const useAdminTeamMembers = (teamId: MaybeRefOrGetter<string>) => {
  const adminApi = useAdminApi()

  const query = useQuery({
    key: () => adminKeys.teamMembers(toValue(teamId)),
    query: () => adminApi.getTeamMembers(toValue(teamId)),
    staleTime: 2 * 60 * 1000, // 2 minutes
  })

  const members = computed(() => query.data.value?.members ?? [])
  const total = computed(() => query.data.value?.total ?? 0)

  return {
    ...query,
    members,
    total,
  }
}
