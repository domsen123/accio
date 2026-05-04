import { useQuery } from '@pinia/colada'
import { useOrganisationMembersApi } from '../api/organisation-members.api'
import { organisationMembersKeys } from '../api/organisation-members.keys'

export const useOrganisationRoles = (organisationId: MaybeRefOrGetter<string>) => {
  const organisationMembersApi = useOrganisationMembersApi()

  const query = useQuery({
    key: () => organisationMembersKeys.roles(toValue(organisationId)),
    query: () => organisationMembersApi.getRoles(toValue(organisationId)),
    staleTime: 5 * 60 * 1000, // 5 minutes - roles change rarely
  })

  const roles = computed(() =>
    query.data.value?.roles ?? [],
  )

  return {
    ...query,
    roles,
  }
}
