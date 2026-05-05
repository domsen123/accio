import type { TodoCounts } from '../types/todo.types'
import { useQuery } from '@pinia/colada'
import { useTodoApi } from '../api/todo.api'
import { todoKeys } from '../api/todo.keys'

/**
 * Aggregate counts for the four canonical views. Used to render the badge
 * count next to each tab in the todo sub-nav (REQ-TODO-4).
 *
 * Cached for a minute — the badge is informational, not load-bearing for
 * any decision; on completion / soft-delete the mutations layer invalidates
 * this query family explicitly.
 */
export const useTodoCounts = () => {
  const todoApi = useTodoApi()

  const query = useQuery({
    key: () => todoKeys.counts(),
    query: () => todoApi.getCounts(),
    staleTime: 60 * 1000,
  })

  const counts = computed<TodoCounts>(() =>
    query.data.value?.counts ?? { today: 0, upcoming: 0, open: 0, completed: 0 },
  )

  return {
    ...query,
    counts,
  }
}
