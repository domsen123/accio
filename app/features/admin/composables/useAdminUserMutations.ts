import type { UpdateUserInput } from '../types/admin.types'
import { useMutation, useQueryCache } from '@pinia/colada'
import { useAdminApi } from '../api/admin.api'
import { adminKeys } from '../api/admin.keys'

export const useUpdateUser = () => {
  const queryCache = useQueryCache()
  const adminApi = useAdminApi()

  return useMutation({
    mutation: ({ id, data }: { id: string, data: UpdateUserInput }) =>
      adminApi.updateUser(id, data),
    onSettled: (_data, _error, variables) => {
      queryCache.invalidateQueries({ key: adminKeys.users() })
      queryCache.invalidateQueries({ key: adminKeys.user(variables.id) })
    },
  })
}

export const useDeleteUser = () => {
  const queryCache = useQueryCache()
  const adminApi = useAdminApi()

  return useMutation({
    mutation: (id: string) => adminApi.deleteUser(id),
    onSettled: () => {
      queryCache.invalidateQueries({ key: adminKeys.users() })
    },
  })
}
