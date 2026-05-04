import type { UpdateAuthProviderInput } from '../types/admin.types'
import { useMutation, useQuery, useQueryCache } from '@pinia/colada'
import { useAdminApi } from '../api/admin.api'
import { adminKeys } from '../api/admin.keys'

export const useAdminAuthProviders = () => {
  const adminApi = useAdminApi()

  const query = useQuery({
    key: adminKeys.authProviders,
    query: () => adminApi.getAuthProviders(),
    staleTime: 2 * 60 * 1000,
  })

  const providers = computed(() => query.data.value?.providers ?? [])

  return {
    ...query,
    providers,
  }
}

export const useUpdateAuthProvider = () => {
  const queryCache = useQueryCache()
  const adminApi = useAdminApi()

  return useMutation({
    mutation: ({ provider, data }: { provider: string, data: UpdateAuthProviderInput }) =>
      adminApi.updateAuthProvider(provider, data),
    onSettled: () => {
      queryCache.invalidateQueries({ key: adminKeys.authProviders() })
    },
  })
}
