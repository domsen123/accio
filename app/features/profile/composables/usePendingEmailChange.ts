import { useQuery } from '@pinia/colada'
import { useProfileApi } from '../api/profile.api'
import { profileKeys } from '../api/profile.keys'

export const usePendingEmailChange = () => {
  const profileApi = useProfileApi()

  const query = useQuery({
    key: profileKeys.pendingEmailChange,
    query: () => profileApi.getPendingEmailChange(),
    staleTime: 1000 * 60, // 1 minute
  })

  const pending = computed(() => query.data.value?.pending ?? null)

  return {
    ...query,
    pending,
  }
}
