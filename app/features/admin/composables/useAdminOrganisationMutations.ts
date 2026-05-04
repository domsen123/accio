import type { CreateOrganisationInput, UpdateOrganisationInput } from '../types/admin.types'
import { useMutation, useQueryCache } from '@pinia/colada'
import { useAdminApi } from '../api/admin.api'
import { adminKeys } from '../api/admin.keys'

export const useCreateOrganisation = () => {
  const queryCache = useQueryCache()
  const adminApi = useAdminApi()

  return useMutation({
    mutation: (data: CreateOrganisationInput) => adminApi.createOrganisation(data),
    onSettled: () => {
      queryCache.invalidateQueries({ key: adminKeys.organisations() })
    },
  })
}

export const useUpdateOrganisation = () => {
  const queryCache = useQueryCache()
  const adminApi = useAdminApi()

  return useMutation({
    mutation: ({ id, data }: { id: string, data: UpdateOrganisationInput }) =>
      adminApi.updateOrganisation(id, data),
    onSettled: (_data, _error, variables) => {
      queryCache.invalidateQueries({ key: adminKeys.organisations() })
      queryCache.invalidateQueries({ key: adminKeys.organisation(variables.id) })
    },
  })
}
