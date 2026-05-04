import type {
  CreateOrganisationInput,
  OrganisationWithOwnerResponse,
} from '../types/organisations.types'

export const useOrganisationsApi = () => {
  const { $api } = useNuxtApp()

  return {
    /**
     * Create a new organisation (user-facing endpoint)
     * The current user will automatically become the Owner
     */
    create: (data: CreateOrganisationInput): Promise<OrganisationWithOwnerResponse> =>
      $api('/api/organisations', {
        method: 'POST',
        body: data,
      }),
  }
}
