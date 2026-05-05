import type { MaybeRefOrGetter } from 'vue'
import type { KbEntriesListParams } from '../types/kb.types'
import { useQuery } from '@pinia/colada'
import { useKbApi } from '../api/kb.api'
import { kbKeys } from '../api/kb.keys'

/**
 * List KB entries with reactive params (search, filters, pagination).
 * Server FTS kicks in when `search` is a non-empty string.
 */
export const useKbEntries = (params?: MaybeRefOrGetter<KbEntriesListParams>) => {
  const kbApi = useKbApi()

  const query = useQuery({
    key: () => kbKeys.entries(toValue(params)),
    query: () => kbApi.listEntries(toValue(params)),
    staleTime: 30 * 1000,
  })

  const entries = computed(() => query.data.value?.data ?? [])
  const limit = computed(() => query.data.value?.limit ?? null)
  const offset = computed(() => query.data.value?.offset ?? 0)

  return {
    ...query,
    entries,
    limit,
    offset,
  }
}
