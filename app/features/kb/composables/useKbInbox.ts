import type { MaybeRefOrGetter } from 'vue'
import type { KbPaginatedListParams } from '../types/kb.types'
import { useQuery } from '@pinia/colada'
import { useKbApi } from '../api/kb.api'
import { kbKeys } from '../api/kb.keys'

/**
 * Inbox view (T-1.10) — entries with `status='inbox'`. Paginated.
 *
 * Mirrors `useKbEntries` but hits `/api/kb/inbox`. Server orders by
 * `created_at desc`; we just pass `limit`/`offset` through.
 */
export const useKbInbox = (params?: MaybeRefOrGetter<KbPaginatedListParams>) => {
  const kbApi = useKbApi()

  const query = useQuery({
    key: () => kbKeys.inbox(toValue(params)),
    query: () => kbApi.listInbox(toValue(params)),
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
