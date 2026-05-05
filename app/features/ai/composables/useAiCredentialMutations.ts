import type { SetAiCredentialsInput } from '../types/ai.types'
import { useMutation, useQueryCache } from '@pinia/colada'
import { useAiApi } from '../api/ai.api'
import { aiKeys } from '../api/ai.keys'

const invalidateAi = (queryCache: ReturnType<typeof useQueryCache>) => {
  queryCache.invalidateQueries({ key: aiKeys.providers() })
  queryCache.invalidateQueries({ key: aiKeys.credentials() })
  queryCache.invalidateQueries({ key: aiKeys.models() })
}

/**
 * Save or replace the workspace's API key for one provider. The plaintext
 * is sent over HTTPS once, encrypted on the server, and never returned.
 */
export const useSetAiCredential = () => {
  const queryCache = useQueryCache()
  const aiApi = useAiApi()

  return useMutation({
    mutation: ({ providerId, data }: { providerId: string, data: SetAiCredentialsInput }) =>
      aiApi.setCredentials(providerId, data),
    onSuccess: () => invalidateAi(queryCache),
  })
}

export const useClearAiCredential = () => {
  const queryCache = useQueryCache()
  const aiApi = useAiApi()

  return useMutation({
    mutation: (providerId: string) => aiApi.clearCredentials(providerId),
    onSuccess: () => invalidateAi(queryCache),
  })
}
