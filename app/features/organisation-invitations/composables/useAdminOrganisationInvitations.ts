import { useQuery } from '@pinia/colada'
import { useOrganisationInvitationsApi } from '../api/organisation-invitations.api'
import { organisationInvitationsKeys } from '../api/organisation-invitations.keys'

export const useAdminOrganisationInvitations = (organisationId: MaybeRefOrGetter<string>) => {
  const organisationInvitationsApi = useOrganisationInvitationsApi()

  const query = useQuery({
    key: () => organisationInvitationsKeys.list(toValue(organisationId)),
    query: () => organisationInvitationsApi.getInvitations(toValue(organisationId)),
    staleTime: 2 * 60 * 1000, // 2 minutes
  })

  const invitations = computed(() =>
    query.data.value?.invitations ?? [],
  )

  const total = computed(() =>
    query.data.value?.total ?? 0,
  )

  return {
    ...query,
    invitations,
    total,
  }
}
