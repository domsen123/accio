import type { MaybeRefOrGetter } from 'vue'
import { useQuery } from '@pinia/colada'
import { useKbApi } from '../api/kb.api'
import { kbKeys } from '../api/kb.keys'

/**
 * Fetch a single KB entry by slug. The server route also accepts ids
 * transparently, but the detail page uses a slug-based URL.
 */
export const useKbEntry = (slug: MaybeRefOrGetter<string>) => {
  const kbApi = useKbApi()

  const query = useQuery({
    key: () => kbKeys.entry(toValue(slug)),
    query: () => kbApi.getEntryBySlug(toValue(slug)),
    staleTime: 30 * 1000,
    enabled: () => Boolean(toValue(slug)),
  })

  const entry = computed(() => query.data.value?.entry ?? null)

  return {
    ...query,
    entry,
  }
}
