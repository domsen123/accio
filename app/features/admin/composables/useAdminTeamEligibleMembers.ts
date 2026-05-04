import type { MaybeRefOrGetter } from 'vue'
import { useQuery } from '@pinia/colada'
import { useAdminApi } from '../api/admin.api'
import { adminKeys } from '../api/admin.keys'

export const useAdminTeamEligibleMembers = (teamId: MaybeRefOrGetter<string>) => {
  const adminApi = useAdminApi()

  const query = useQuery({
    key: () => adminKeys.teamEligibleMembers(toValue(teamId)),
    query: () => adminApi.getTeamEligibleMembers(toValue(teamId)),
    staleTime: 1 * 60 * 1000, // 1 minute (shorter - changes when members added)
  })

  const members = computed(() => query.data.value?.members ?? [])

  return {
    ...query,
    members,
  }
}
