import { useQuery } from '@pinia/colada'
import { useAuthApi } from '../api/auth.api'
import { authKeys } from '../api/auth.keys'

export const useSession = () => {
  const authApi = useAuthApi()

  const query = useQuery({
    key: authKeys.session(),
    query: () => authApi.getSession(),
    staleTime: 5 * 60 * 1000, // 5 minutes - session is relatively stable
  })

  const user = computed(() => query.data.value?.user ?? null)
  const isAuthenticated = computed(() => !!user.value)
  const isAnonymous = computed(() => user.value?.authProvider === 'anonymous')
  const isLoading = computed(() => query.status.value === 'pending')

  // Impersonation state
  const impersonation = computed(() => query.data.value?.impersonation ?? null)
  const isImpersonating = computed(() => !!impersonation.value)

  return {
    ...query,
    user,
    isAuthenticated,
    isLoading,
    impersonation,
    isAnonymous,
    isImpersonating,
  }
}
