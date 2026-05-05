import type { UpdateAiSettingsInput } from '../types/ai.types'
import { useMutation, useQueryCache } from '@pinia/colada'
import { useAiApi } from '../api/ai.api'
import { aiKeys } from '../api/ai.keys'

export const useUpdateAiSettings = () => {
  const queryCache = useQueryCache()
  const aiApi = useAiApi()

  return useMutation({
    mutation: (data: UpdateAiSettingsInput) => aiApi.updateSettings(data),
    onSuccess: () => {
      queryCache.invalidateQueries({ key: aiKeys.settings() })
    },
  })
}
