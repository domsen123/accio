import type { CreateAiModelInput, UpdateAiModelInput, UpdateAiProviderInput } from '../types/ai.types'
import { useMutation, useQuery, useQueryCache } from '@pinia/colada'
import { useAiApi } from '../api/ai.api'
import { aiKeys } from '../api/ai.keys'

/**
 * Full provider + model registry for the admin model registry page.
 * Lists every provider and every model, including disabled rows.
 */
export const useAdminAiProviders = () => {
  const aiApi = useAiApi()
  const query = useQuery({
    key: aiKeys.admin.providers(),
    query: () => aiApi.adminListProviders(),
    staleTime: 30 * 1000,
  })
  const providers = computed(() => query.data.value?.providers ?? [])
  return { ...query, providers }
}

export const useAdminAiModels = () => {
  const aiApi = useAiApi()
  const query = useQuery({
    key: aiKeys.admin.models(),
    query: () => aiApi.adminListModels(),
    staleTime: 30 * 1000,
  })
  const models = computed(() => query.data.value?.models ?? [])
  return { ...query, models }
}

const invalidateAdminAi = (queryCache: ReturnType<typeof useQueryCache>) => {
  queryCache.invalidateQueries({ key: aiKeys.admin.models() })
  queryCache.invalidateQueries({ key: aiKeys.admin.providers() })
  // Also invalidate workspace-side caches; a registry change ripples through
  // the picker on /app/settings/ai.
  queryCache.invalidateQueries({ key: aiKeys.models() })
  queryCache.invalidateQueries({ key: aiKeys.providers() })
}

export const useAdminCreateAiModel = () => {
  const queryCache = useQueryCache()
  const aiApi = useAiApi()
  return useMutation({
    mutation: (data: CreateAiModelInput) => aiApi.adminCreateModel(data),
    onSuccess: () => invalidateAdminAi(queryCache),
  })
}

export const useAdminUpdateAiModel = () => {
  const queryCache = useQueryCache()
  const aiApi = useAiApi()
  return useMutation({
    mutation: ({ id, data }: { id: string, data: UpdateAiModelInput }) =>
      aiApi.adminUpdateModel(id, data),
    onSuccess: () => invalidateAdminAi(queryCache),
  })
}

export const useAdminDeleteAiModel = () => {
  const queryCache = useQueryCache()
  const aiApi = useAiApi()
  return useMutation({
    mutation: (id: string) => aiApi.adminDeleteModel(id),
    onSuccess: () => invalidateAdminAi(queryCache),
  })
}

export const useAdminUpdateAiProvider = () => {
  const queryCache = useQueryCache()
  const aiApi = useAiApi()
  return useMutation({
    mutation: ({ id, data }: { id: string, data: UpdateAiProviderInput }) =>
      aiApi.adminUpdateProvider(id, data),
    onSuccess: () => invalidateAdminAi(queryCache),
  })
}
