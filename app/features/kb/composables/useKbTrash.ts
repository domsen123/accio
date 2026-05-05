import type { MaybeRefOrGetter } from 'vue'
import type { KbPaginatedListParams } from '../types/kb.types'
import { useQuery } from '@pinia/colada'
import { useKbApi } from '../api/kb.api'
import { kbKeys } from '../api/kb.keys'

/**
 * Trash view (T-1.10) — soft-deleted entries (`deleted_at IS NOT NULL`).
 *
 * Server orders by `deleted_at desc`. Restore / purge mutations live in
 * `useKbEntryMutations` and invalidate this query family on success.
 */
export const useKbTrash = (params?: MaybeRefOrGetter<KbPaginatedListParams>) => {
  const kbApi = useKbApi()

  const query = useQuery({
    key: () => kbKeys.trash(toValue(params)),
    query: () => kbApi.listTrash(toValue(params)),
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
