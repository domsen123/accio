import { useQuery } from '@pinia/colada'
import { useOrganisationMembersApi } from '../api/organisation-members.api'
import { organisationMembersKeys } from '../api/organisation-members.keys'

export const useAdminOrganisationMembers = (organisationId: MaybeRefOrGetter<string>) => {
  const organisationMembersApi = useOrganisationMembersApi()

  const query = useQuery({
    key: () => organisationMembersKeys.members(toValue(organisationId)),
    query: () => organisationMembersApi.getMembers(toValue(organisationId)),
    staleTime: 2 * 60 * 1000, // 2 minutes
  })

  const members = computed(() =>
    query.data.value?.members ?? [],
  )

  const total = computed(() =>
    query.data.value?.total ?? 0,
  )

  return {
    ...query,
    members,
    total,
  }
}
