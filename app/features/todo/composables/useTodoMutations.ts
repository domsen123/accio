/**
 * Todo state-transition mutations (T-2.5) + create / update (T-2.6).
 *
 * Mirrors the KB mutations pattern: each call returns a Pinia Colada
 * `useMutation` so the page owns the loading + error surface. Invalidation
 * funnels through {@link invalidateTodo} so every list / view / counts
 * subscriber stays in sync after any mutation.
 */
import type { CreateTodoInput, Todo, UpdateTodoInput } from '../types/todo.types'
import { useMutation, useQueryCache } from '@pinia/colada'
import { kbKeys } from '~/features/kb/api/kb.keys'
import { useTodoApi } from '../api/todo.api'
import { todoKeys } from '../api/todo.keys'

/**
 * Centralised invalidation. Every todo-mutating call should funnel through
 * this so the four canonical views, the generic list, the counts badges,
 * and any open detail view all stay coherent after a mutation.
 *
 * `todo` may be undefined for mutations that don't echo a payload (none in
 * the current set, but the parameter keeps the API symmetric with KB).
 *
 * Cross-feature invalidation (T-2.8): KB entry detail pages render a
 * "Linked todos" panel keyed under `kb`. Todo mutations from the KB-side
 * checkbox bypass the `todos` family altogether unless we also bust the
 * `kb` root here. We invalidate at the `kb` root rather than each linked
 * entry id because (a) the todo response doesn't carry the linked entry
 * ids and (b) `kb` queries are stale-time-gated, so the over-invalidation
 * is cheap.
 */
const invalidateTodo = (
  queryCache: ReturnType<typeof useQueryCache>,
  todo: Todo | undefined,
) => {
  // List + every canonical view share a `views` / `list` key prefix; we
  // invalidate at the `todos` root so all four view caches and the counts
  // badge refresh together.
  queryCache.invalidateQueries({ key: todoKeys.all })
  if (todo?.id)
    queryCache.invalidateQueries({ key: todoKeys.detail(todo.id) })
  // Also invalidate the KB linked-todos display so the KB detail page picks
  // up the new completion state (T-2.8). Scoped to the linked-todos family
  // so untouched KB queries (entries / backlinks / categories) stay warm.
  queryCache.invalidateQueries({ key: [...kbKeys.all, 'entry'] })
}

export const useCompleteTodo = () => {
  const queryCache = useQueryCache()
  const todoApi = useTodoApi()

  return useMutation({
    mutation: (id: string): Promise<{ todo: Todo }> => todoApi.complete(id),
    onSuccess: ({ todo }) => {
      invalidateTodo(queryCache, todo)
    },
  })
}

export const useUncompleteTodo = () => {
  const queryCache = useQueryCache()
  const todoApi = useTodoApi()

  return useMutation({
    mutation: (id: string): Promise<{ todo: Todo }> => todoApi.uncomplete(id),
    onSuccess: ({ todo }) => {
      invalidateTodo(queryCache, todo)
    },
  })
}

export const useSoftDeleteTodo = () => {
  const queryCache = useQueryCache()
  const todoApi = useTodoApi()

  return useMutation({
    mutation: (id: string): Promise<{ todo: Todo }> => todoApi.softDelete(id),
    onSuccess: ({ todo }) => {
      invalidateTodo(queryCache, todo)
    },
  })
}

export const useRestoreTodo = () => {
  const queryCache = useQueryCache()
  const todoApi = useTodoApi()

  return useMutation({
    mutation: (id: string): Promise<{ todo: Todo }> => todoApi.restore(id),
    onSuccess: ({ todo }) => {
      invalidateTodo(queryCache, todo)
    },
  })
}

/**
 * Create a new todo (T-2.6, REQ-TODO-1..3).
 *
 * On success the broad `todos` query family is invalidated so the four
 * canonical view caches and the counts badge refresh together — the new
 * row may belong to any view depending on its due date.
 */
export const useCreateTodo = () => {
  const queryCache = useQueryCache()
  const todoApi = useTodoApi()

  return useMutation({
    mutation: (data: CreateTodoInput): Promise<{ todo: Todo }> => todoApi.create(data),
    onSuccess: ({ todo }) => {
      invalidateTodo(queryCache, todo)
    },
  })
}

/**
 * Patch an existing todo (T-2.6, REQ-TODO-1..3). Supplying `tagNames` /
 * `kbEntryIds` replaces the corresponding relation set; passing `null` for
 * `dueAt` / `parentTodoId` clears.
 */
export const useUpdateTodo = () => {
  const queryCache = useQueryCache()
  const todoApi = useTodoApi()

  return useMutation({
    mutation: ({ id, data }: { id: string, data: UpdateTodoInput }): Promise<{ todo: Todo }> =>
      todoApi.update(id, data),
    onSuccess: ({ todo }) => {
      invalidateTodo(queryCache, todo)
    },
  })
}
