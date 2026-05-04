import { useQuery } from '@pinia/colada'
import { useAdminApi } from '../api/admin.api'
import { adminKeys } from '../api/admin.keys'

export const useAdminStats = () => {
  const adminApi = useAdminApi()

  const query = useQuery({
    key: adminKeys.stats,
    query: () => adminApi.getStats(),
    staleTime: 2 * 60 * 1000, // 2 minutes
  })

  const stats = computed(() => query.data.value ?? null)

  return {
    ...query,
    stats,
  }
}
