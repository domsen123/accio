/**
 * Todo API wrappers — typed `$fetch` calls into `/api/todos/...` (T-2.4).
 *
 * Mirrors the KB slice convention: a `useTodoApi()` factory grabs the
 * SSR-aware `$api` from `useNuxtApp()` so cookies forward correctly during
 * server-side rendering. Workspace context follows the same `X-Organisation-Id`
 * header / query fallback as the rest of the workspace-scoped APIs.
 *
 * T-2.5 surface: list + canonical views + counts + state-transition
 * mutations. Create / update / hydrated detail are introduced in T-2.6.
 */
import type {
  CreateTodoInput,
  Todo,
  TodoCountsResponse,
  TodoDetailResponse,
  TodoMutationResponse,
  TodosListParams,
  TodosListResponse,
  TodoViewListParams,
  UpcomingTodosListParams,
  UpcomingTodosListResponse,
  UpdateTodoInput,
} from '../types/todo.types'

export const useTodoApi = () => {
  const { $api } = useNuxtApp()

  return {
    listTodos: (params?: TodosListParams): Promise<TodosListResponse> =>
      $api('/api/todos', { query: params }),

    listToday: (params?: TodoViewListParams): Promise<TodosListResponse> =>
      $api('/api/todos/today', { query: params }),

    listUpcoming: (params?: UpcomingTodosListParams): Promise<UpcomingTodosListResponse> =>
      $api('/api/todos/upcoming', { query: params }),

    listOpen: (params?: TodoViewListParams): Promise<TodosListResponse> =>
      $api('/api/todos/open', { query: params }),

    listCompleted: (params?: TodoViewListParams): Promise<TodosListResponse> =>
      $api('/api/todos/completed', { query: params }),

    getCounts: (): Promise<TodoCountsResponse> =>
      $api('/api/todos/counts'),

    /**
     * Fetch a single hydrated todo (tags, KB links, immediate subtask count).
     * Used by the detail and edit pages (T-2.6). The typed `$fetch` overload
     * also narrows `/api/todos/${string}` against the literal sibling routes,
     * so the URL is funneled through `String()` (same trick as `softDelete`).
     */
    getById: (id: string): Promise<TodoDetailResponse> =>
      $api(String(`/api/todos/${id}`)),

    create: (data: CreateTodoInput): Promise<TodoMutationResponse> =>
      $api('/api/todos', { method: 'POST', body: data }),

    update: (id: string, data: UpdateTodoInput): Promise<TodoMutationResponse> =>
      $api(String(`/api/todos/${id}`), { method: 'PATCH', body: data }),

    complete: (id: string): Promise<TodoMutationResponse> =>
      $api(`/api/todos/${id}/complete`, { method: 'POST' }),

    uncomplete: (id: string): Promise<TodoMutationResponse> =>
      $api(`/api/todos/${id}/uncomplete`, { method: 'POST' }),

    /**
     * The typed `$fetch` narrows `/api/todos/${string}` against every literal
     * sibling route (`/api/todos/today`, `/api/todos/counts`, …) which are
     * all GET-only — TS then forbids `method: 'DELETE'` here. We funnel the
     * URL through `String()` so TS treats it as a plain `string` (which
     * disables route-method narrowing) and the dynamic `[id]` DELETE route
     * is what actually fires at runtime.
     */
    softDelete: (id: string): Promise<{ todo: Todo }> =>
      $api(String(`/api/todos/${id}`), { method: 'DELETE' }),

    restore: (id: string): Promise<TodoMutationResponse> =>
      $api(`/api/todos/${id}/restore`, { method: 'POST' }),
  }
}
