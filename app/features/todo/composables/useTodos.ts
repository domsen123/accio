import type { MaybeRefOrGetter } from 'vue'
import type { TodosListParams } from '../types/todo.types'
import { useQuery } from '@pinia/colada'
import { useTodoApi } from '../api/todo.api'
import { todoKeys } from '../api/todo.keys'

/**
 * List todos with reactive params (search, filters, pagination).
 * The default endpoint applies no canonical-view date predicate; pages that
 * want a view should use {@link useTodoView} instead.
 */
export const useTodos = (params?: MaybeRefOrGetter<TodosListParams>) => {
  const todoApi = useTodoApi()

  const query = useQuery({
    key: () => todoKeys.list(toValue(params)),
    query: () => todoApi.listTodos(toValue(params)),
    staleTime: 30 * 1000,
  })

  const todos = computed(() => query.data.value?.data ?? [])
  const limit = computed(() => query.data.value?.limit ?? null)
  const offset = computed(() => query.data.value?.offset ?? 0)

  return {
    ...query,
    todos,
    limit,
    offset,
  }
}
