import type { MaybeRefOrGetter } from 'vue'
import { useQuery } from '@pinia/colada'
import { useTodoApi } from '../api/todo.api'
import { todoKeys } from '../api/todo.keys'

/**
 * Fetch a single hydrated todo by id (T-2.6).
 *
 * The server endpoint returns the todo row plus relations (tags, KB links)
 * and an immediate subtask count. Used by the detail and edit pages.
 */
export const useTodoById = (id: MaybeRefOrGetter<string>) => {
  const todoApi = useTodoApi()

  const query = useQuery({
    key: () => todoKeys.detail(toValue(id)),
    query: () => todoApi.getById(toValue(id)),
    staleTime: 30 * 1000,
    enabled: () => Boolean(toValue(id)),
  })

  const todo = computed(() => query.data.value?.todo ?? null)

  return {
    ...query,
    todo,
  }
}
