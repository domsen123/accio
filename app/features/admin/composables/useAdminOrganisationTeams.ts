import type { MaybeRefOrGetter } from 'vue'
import { useQuery } from '@pinia/colada'
import { useAdminApi } from '../api/admin.api'
import { adminKeys } from '../api/admin.keys'

export const useAdminOrganisationTeams = (organisationId: MaybeRefOrGetter<string>) => {
  const adminApi = useAdminApi()

  const query = useQuery({
    key: () => adminKeys.organisationTeams(toValue(organisationId)),
    query: () => adminApi.getOrganisationTeams(toValue(organisationId)),
    staleTime: 2 * 60 * 1000, // 2 minutes
  })

  const teams = computed(() => query.data.value?.teams ?? [])
  const total = computed(() => query.data.value?.total ?? 0)

  return {
    ...query,
    teams,
    total,
  }
}
