import { useQuery } from '@pinia/colada'
import { useAuthApi } from '../api/auth.api'
import { authKeys } from '../api/auth.keys'

export const useSessions = () => {
  const authApi = useAuthApi()

  const query = useQuery({
    key: authKeys.sessions,
    query: () => authApi.getSessions(),
    staleTime: 1000 * 60, // 1 minute
  })

  const sessions = computed(() => query.data.value?.sessions ?? [])

  return {
    ...query,
    sessions,
  }
}
