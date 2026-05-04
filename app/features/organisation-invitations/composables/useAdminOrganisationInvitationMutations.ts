import { useMutation, useQueryCache } from '@pinia/colada'
import { useOrganisationInvitationsApi } from '../api/organisation-invitations.api'
import { organisationInvitationsKeys } from '../api/organisation-invitations.keys'

export const useRevokeOrganisationInvitation = () => {
  const queryCache = useQueryCache()
  const organisationInvitationsApi = useOrganisationInvitationsApi()

  return useMutation({
    mutation: ({ organisationId, invitationId }: { organisationId: string, invitationId: string }) =>
      organisationInvitationsApi.revokeInvitation(organisationId, invitationId),
    onSettled: (_data, _error, variables) => {
      queryCache.invalidateQueries({ key: organisationInvitationsKeys.list(variables.organisationId) })
    },
  })
}

export const useResendOrganisationInvitation = () => {
  const queryCache = useQueryCache()
  const organisationInvitationsApi = useOrganisationInvitationsApi()

  return useMutation({
    mutation: ({ organisationId, invitationId }: { organisationId: string, invitationId: string }) =>
      organisationInvitationsApi.resendInvitation(organisationId, invitationId),
    onSettled: (_data, _error, variables) => {
      queryCache.invalidateQueries({ key: organisationInvitationsKeys.list(variables.organisationId) })
    },
  })
}
