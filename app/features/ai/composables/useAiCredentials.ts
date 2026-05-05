import { useQuery } from '@pinia/colada'
import { useAiApi } from '../api/ai.api'
import { aiKeys } from '../api/ai.keys'

/**
 * Per-provider credential status for the active workspace. NEVER returns the
 * key or the encrypted blob — only whether one is set.
 */
export const useAiCredentials = () => {
  const aiApi = useAiApi()

  const query = useQuery({
    key: aiKeys.credentials(),
    query: () => aiApi.listCredentials(),
    staleTime: 30 * 1000,
  })

  const credentials = computed(() => query.data.value?.credentials ?? [])

  return {
    ...query,
    credentials,
  }
}
