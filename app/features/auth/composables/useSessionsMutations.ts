import { useMutation, useQueryCache } from '@pinia/colada'
import { useAuthApi } from '../api/auth.api'
import { authKeys } from '../api/auth.keys'

export const useLogoutOtherSessions = () => {
  const queryCache = useQueryCache()
  const authApi = useAuthApi()

  return useMutation({
    mutation: () => authApi.logoutOtherSessions(),
    onSettled: () => {
      queryCache.invalidateQueries({ key: authKeys.sessions() })
    },
  })
}

export const useRevokeSession = () => {
  const queryCache = useQueryCache()
  const authApi = useAuthApi()

  return useMutation({
    mutation: (sessionId: string) => authApi.revokeSession(sessionId),
    onSettled: () => {
      queryCache.invalidateQueries({ key: authKeys.sessions() })
    },
  })
}
