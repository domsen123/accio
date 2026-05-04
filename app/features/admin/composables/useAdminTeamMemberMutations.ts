import type { AddTeamMemberInput } from '../types/admin.types'
import { useMutation, useQueryCache } from '@pinia/colada'
import { useAdminApi } from '../api/admin.api'
import { adminKeys } from '../api/admin.keys'

export const useAddTeamMember = () => {
  const queryCache = useQueryCache()
  const adminApi = useAdminApi()

  return useMutation({
    mutation: ({ teamId, data }: { teamId: string, data: AddTeamMemberInput }) =>
      adminApi.addTeamMember(teamId, data),
    onSettled: (_data, _error, variables) => {
      queryCache.invalidateQueries({ key: adminKeys.teamMembers(variables.teamId) })
      queryCache.invalidateQueries({ key: adminKeys.teamEligibleMembers(variables.teamId) })
    },
  })
}

export const useRemoveTeamMember = () => {
  const queryCache = useQueryCache()
  const adminApi = useAdminApi()

  return useMutation({
    mutation: ({ teamId, userId }: { teamId: string, userId: string }) =>
      adminApi.removeTeamMember(teamId, userId),
    onSettled: (_data, _error, variables) => {
      queryCache.invalidateQueries({ key: adminKeys.teamMembers(variables.teamId) })
      queryCache.invalidateQueries({ key: adminKeys.teamEligibleMembers(variables.teamId) })
    },
  })
}
