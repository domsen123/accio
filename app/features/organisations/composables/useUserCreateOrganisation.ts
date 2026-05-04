import type { CreateOrganisationInput } from '../types/organisations.types'
import { useMutation, useQueryCache } from '@pinia/colada'
import { adminKeys } from '~/features/admin/api/admin.keys'
import { useOrganisationsApi } from '../api/organisations.api'
import { organisationsKeys } from '../api/organisations.keys'

export const useUserCreateOrganisation = () => {
  const queryCache = useQueryCache()
  const organisationsApi = useOrganisationsApi()

  return useMutation({
    mutation: (data: CreateOrganisationInput) => organisationsApi.create(data),
    onSettled: () => {
      // Invalidate both user-facing and admin organisation lists
      queryCache.invalidateQueries({ key: organisationsKeys.list() })
      queryCache.invalidateQueries({ key: adminKeys.organisations() })
    },
  })
}
