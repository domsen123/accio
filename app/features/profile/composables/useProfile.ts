import { useQuery } from '@pinia/colada'
import { useProfileApi } from '../api/profile.api'
import { profileKeys } from '../api/profile.keys'

export const useProfile = () => {
  const profileApi = useProfileApi()

  const query = useQuery({
    key: () => profileKeys.profile(),
    query: () => profileApi.getProfile(),
    staleTime: 2 * 60 * 1000, // 2 minutes
  })

  const profile = computed(() => query.data.value?.profile ?? null)

  return {
    ...query,
    profile,
  }
}
