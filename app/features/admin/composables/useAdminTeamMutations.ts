import type { CreateTeamInput, UpdateTeamInput } from '../types/admin.types'
import { useMutation, useQueryCache } from '@pinia/colada'
import { useAdminApi } from '../api/admin.api'
import { adminKeys } from '../api/admin.keys'

export const useCreateTeam = () => {
  const queryCache = useQueryCache()
  const adminApi = useAdminApi()

  return useMutation({
    mutation: ({ organisationId, data }: { organisationId: string, data: CreateTeamInput }) =>
      adminApi.createTeam(organisationId, data),
    onSettled: (_data, _error, variables) => {
      queryCache.invalidateQueries({ key: adminKeys.organisationTeams(variables.organisationId) })
      queryCache.invalidateQueries({ key: adminKeys.teams() })
    },
  })
}

export const useUpdateTeam = () => {
  const queryCache = useQueryCache()
  const adminApi = useAdminApi()

  return useMutation({
    mutation: ({ id, data }: { id: string, data: UpdateTeamInput }) =>
      adminApi.updateTeam(id, data),
    onSettled: (_data, _error, variables) => {
      queryCache.invalidateQueries({ key: adminKeys.team(variables.id) })
      queryCache.invalidateQueries({ key: adminKeys.teams() })
    },
  })
}

export const useDeleteTeam = () => {
  const queryCache = useQueryCache()
  const adminApi = useAdminApi()

  return useMutation({
    mutation: (id: string) => adminApi.deleteTeam(id),
    onSettled: () => {
      queryCache.invalidateQueries({ key: adminKeys.teams() })
    },
  })
}
