import type { MaybeRefOrGetter } from 'vue'
import type { KbLinkedTodosParams } from '../types/kb.types'
import { useQuery } from '@pinia/colada'
import { useKbApi } from '../api/kb.api'
import { kbKeys } from '../api/kb.keys'

/**
 * Todos that link to the given KB entry (T-2.8, REQ-TODO-3).
 *
 * The route is id-keyed (matches the backlinks pattern), so callers should
 * resolve the entry id before invoking this. By default completed todos are
 * excluded so the KB entry doesn't surface a wall of done items; pass
 * `includeCompleted: true` to include them.
 */
export const useKbLinkedTodos = (
  entryId: MaybeRefOrGetter<string | null | undefined>,
  params: MaybeRefOrGetter<KbLinkedTodosParams | undefined> = () => undefined,
) => {
  const kbApi = useKbApi()

  const query = useQuery({
    key: () => kbKeys.entryLinkedTodos(toValue(entryId) ?? '', toValue(params)),
    query: () => kbApi.getEntryLinkedTodos(toValue(entryId) ?? '', toValue(params)),
    staleTime: 30 * 1000,
    enabled: () => Boolean(toValue(entryId)),
  })

  const linkedTodos = computed(() => query.data.value?.data ?? [])

  return {
    ...query,
    linkedTodos,
  }
}
