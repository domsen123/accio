import type { MaybeRefOrGetter } from 'vue'
import { useQuery } from '@pinia/colada'
import { useKbApi } from '../api/kb.api'
import { kbKeys } from '../api/kb.keys'

/**
 * List of entries that link TO the given entry (REQ-KB-4). The route is
 * id-keyed, so callers should resolve the entry id before invoking this.
 */
export const useKbBacklinks = (entryId: MaybeRefOrGetter<string | null | undefined>) => {
  const kbApi = useKbApi()

  const query = useQuery({
    key: () => kbKeys.entryBacklinks(toValue(entryId) ?? ''),
    query: () => kbApi.getEntryBacklinks(toValue(entryId) ?? ''),
    staleTime: 30 * 1000,
    enabled: () => Boolean(toValue(entryId)),
  })

  const backlinks = computed(() => query.data.value?.data ?? [])

  return {
    ...query,
    backlinks,
  }
}
