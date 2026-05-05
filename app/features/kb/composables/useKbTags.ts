import type { MaybeRefOrGetter } from 'vue'
import type { KbTagsListParams } from '../types/kb.types'
import { useQuery } from '@pinia/colada'
import { useKbApi } from '../api/kb.api'
import { kbKeys } from '../api/kb.keys'

/**
 * List workspace tags. Pass `withUsage: true` to receive a `usageCount` per
 * tag (a single extra junction lookup on the server).
 */
export const useKbTags = (params?: MaybeRefOrGetter<KbTagsListParams>) => {
  const kbApi = useKbApi()

  const query = useQuery({
    key: () => kbKeys.tags(toValue(params)),
    query: () => kbApi.listTags(toValue(params)),
    staleTime: 5 * 60 * 1000,
  })

  const tags = computed(() => query.data.value?.data ?? [])

  return {
    ...query,
    tags,
  }
}
