import { useQuery } from '@pinia/colada'
import { useAiApi } from '../api/ai.api'
import { aiKeys } from '../api/ai.keys'

/**
 * List enabled models with provider info — used by the workspace settings
 * model picker. Filtering to "providers configured for this workspace" is
 * applied by the caller (we surface every enabled model and let the page
 * cross-reference against `useAiProviders` to pick eligible rows). This keeps
 * server roundtrips simple.
 */
export const useAiModels = () => {
  const aiApi = useAiApi()

  const query = useQuery({
    key: aiKeys.models(),
    query: () => aiApi.listModels(),
    staleTime: 60 * 1000,
  })

  const models = computed(() => query.data.value?.models ?? [])

  return {
    ...query,
    models,
  }
}
