import type { MaybeRefOrGetter } from 'vue'
import type {
  Todo,
  TodosListResponse,
  TodoView,
  TodoViewListParams,
  UpcomingTodosListParams,
} from '../types/todo.types'
import { useQuery } from '@pinia/colada'
import { useTodoApi } from '../api/todo.api'
import { todoKeys } from '../api/todo.keys'

interface UseTodoViewArgs {
  view: TodoView
  params?: TodoViewListParams | UpcomingTodosListParams
}

/**
 * Single composable that takes the active canonical view and returns the
 * appropriate list query (REQ-TODO-4). Each view has its own server endpoint
 * so the predicate (overdue/today, +N days, all-active, completed) and
 * sort live on the server. The composable just routes to the right call
 * and gives the page a uniform `{ todos, isLoading, error, ... }` shape.
 *
 * Pinia-Colada query keys are scoped per view so switching tabs doesn't
 * thrash a single cache entry — each view caches independently.
 */
export const useTodoView = (args: MaybeRefOrGetter<UseTodoViewArgs>) => {
  const todoApi = useTodoApi()

  const view = computed(() => toValue(args).view)
  const params = computed(() => toValue(args).params)

  const query = useQuery({
    key: () => {
      const v = view.value
      const p = params.value
      switch (v) {
        case 'today':
          return todoKeys.today(p as TodoViewListParams | undefined)
        case 'upcoming':
          return todoKeys.upcoming(p as UpcomingTodosListParams | undefined)
        case 'open':
          return todoKeys.open(p as TodoViewListParams | undefined)
        case 'completed':
          return todoKeys.completed(p as TodoViewListParams | undefined)
      }
    },
    query: (): Promise<TodosListResponse> => {
      const v = view.value
      const p = params.value
      switch (v) {
        case 'today':
          return todoApi.listToday(p as TodoViewListParams | undefined)
        case 'upcoming':
          return todoApi.listUpcoming(p as UpcomingTodosListParams | undefined)
        case 'open':
          return todoApi.listOpen(p as TodoViewListParams | undefined)
        case 'completed':
          return todoApi.listCompleted(p as TodoViewListParams | undefined)
      }
    },
    staleTime: 30 * 1000,
  })

  const todos = computed<Todo[]>(() => query.data.value?.data ?? [])
  const limit = computed(() => query.data.value?.limit ?? null)
  const offset = computed(() => query.data.value?.offset ?? 0)

  return {
    ...query,
    todos,
    limit,
    offset,
  }
}
