import type { Ref } from 'vue'
import type { ValidateInvitationResponse } from '../api/organisation-invitations.api'
import { useQuery } from '@pinia/colada'
import { useOrganisationInvitationsApi } from '../api/organisation-invitations.api'
import { organisationInvitationsKeys } from '../api/organisation-invitations.keys'

export const useValidateInvitation = (token: Ref<string | null>) => {
  const api = useOrganisationInvitationsApi()

  return useQuery({
    key: () => organisationInvitationsKeys.validate(token.value),
    query: (): Promise<ValidateInvitationResponse> => {
      if (!token.value) {
        return Promise.resolve({ valid: false })
      }
      return api.validateInvitation(token.value)
    },
    enabled: () => !!token.value,
  })
}
