import type { MaybeRefOrGetter } from 'vue'
import { useMutation, useQuery, useQueryCache } from '@pinia/colada'
import { useAdminApi } from '../api/admin.api'
import { adminKeys } from '../api/admin.keys'

export const useAdminUserRoles = (userId: MaybeRefOrGetter<string>) => {
  const adminApi = useAdminApi()

  const query = useQuery({
    key: () => adminKeys.userRoles(toValue(userId)),
    query: () => adminApi.getUserRoles(toValue(userId)),
    staleTime: 2 * 60 * 1000, // 2 minutes
  })

  const roles = computed(() => query.data.value?.roles ?? [])

  return {
    ...query,
    roles,
  }
}

export const useAdminGlobalRoles = () => {
  const adminApi = useAdminApi()

  const query = useQuery({
    key: () => adminKeys.globalRoles(),
    query: () => adminApi.getGlobalRoles(),
    staleTime: 5 * 60 * 1000, // 5 minutes
  })

  const roles = computed(() => query.data.value?.roles ?? [])

  return {
    ...query,
    roles,
  }
}

export const useAssignUserRole = () => {
  const queryCache = useQueryCache()
  const adminApi = useAdminApi()

  return useMutation({
    mutation: ({ userId, roleId }: { userId: string, roleId: string }) =>
      adminApi.assignUserRole(userId, roleId),
    onSettled: (_data, _error, variables) => {
      queryCache.invalidateQueries({ key: adminKeys.userRoles(variables.userId) })
    },
  })
}

export const useRemoveUserRole = () => {
  const queryCache = useQueryCache()
  const adminApi = useAdminApi()

  return useMutation({
    mutation: ({ userId, roleId }: { userId: string, roleId: string }) =>
      adminApi.removeUserRole(userId, roleId),
    onSettled: (_data, _error, variables) => {
      queryCache.invalidateQueries({ key: adminKeys.userRoles(variables.userId) })
    },
  })
}
