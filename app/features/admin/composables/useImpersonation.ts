import { useMutation, useQueryCache } from '@pinia/colada'
import { authKeys } from '~/features/auth/api/auth.keys'
import { permissionsKeys } from '~/features/permissions/api/permissions.keys'

export const useStartImpersonation = () => {
  const queryCache = useQueryCache()

  return useMutation({
    mutation: (userId: string) =>
      $fetch('/api/admin/impersonate', {
        method: 'POST',
        body: { userId },
      }),
    onSuccess: () => {
      // Invalidate session and permissions to reload as impersonated user
      queryCache.invalidateQueries({ key: authKeys.session() })
      queryCache.invalidateQueries({ key: permissionsKeys.my() })
    },
  })
}

export const useStopImpersonation = () => {
  const queryCache = useQueryCache()

  return useMutation({
    mutation: () =>
      $fetch('/api/admin/impersonate', {
        method: 'DELETE',
      }),
    onSuccess: () => {
      // Invalidate session and permissions to reload as admin
      queryCache.invalidateQueries({ key: authKeys.session() })
      queryCache.invalidateQueries({ key: permissionsKeys.my() })
    },
  })
}
