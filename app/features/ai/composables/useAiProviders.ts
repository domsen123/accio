import { useQuery } from '@pinia/colada'
import { useAiApi } from '../api/ai.api'
import { aiKeys } from '../api/ai.keys'

/**
 * List enabled AI providers + per-workspace credential status.
 *
 * Each row reports `hasCredentials: bool` so the settings page can surface
 * "configured / not configured" without ever touching the encrypted blob.
 */
export const useAiProviders = () => {
  const aiApi = useAiApi()

  const query = useQuery({
    key: aiKeys.providers(),
    query: () => aiApi.listProviders(),
    staleTime: 30 * 1000,
  })

  const providers = computed(() => query.data.value?.providers ?? [])

  return {
    ...query,
    providers,
  }
}
