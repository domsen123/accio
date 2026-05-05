import { useQuery } from '@pinia/colada'
import { useAiApi } from '../api/ai.api'
import { aiKeys } from '../api/ai.keys'

/**
 * Workspace orchestrator settings — default model, AI display name, history
 * limit, system prompt. Created on first read with platform defaults.
 */
export const useAiSettings = () => {
  const aiApi = useAiApi()

  const query = useQuery({
    key: aiKeys.settings(),
    query: () => aiApi.getSettings(),
    staleTime: 30 * 1000,
  })

  const settings = computed(() => query.data.value?.settings)

  return {
    ...query,
    settings,
  }
}
