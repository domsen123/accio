/**
 * Pinia Colada query keys for the Todo feature.
 * Convention follows `app/features/kb/api/kb.keys.ts`.
 */
import type {
  TodosListParams,
  TodoViewListParams,
  UpcomingTodosListParams,
} from '../types/todo.types'

export const todoKeys = {
  all: ['todos'] as const,
  lists: () => [...todoKeys.all, 'list'] as const,
  list: (params?: TodosListParams) => params
    ? [...todoKeys.lists(), params] as const
    : todoKeys.lists(),
  views: () => [...todoKeys.all, 'view'] as const,
  today: (params?: TodoViewListParams) => params
    ? [...todoKeys.views(), 'today', params] as const
    : [...todoKeys.views(), 'today'] as const,
  upcoming: (params?: UpcomingTodosListParams) => params
    ? [...todoKeys.views(), 'upcoming', params] as const
    : [...todoKeys.views(), 'upcoming'] as const,
  open: (params?: TodoViewListParams) => params
    ? [...todoKeys.views(), 'open', params] as const
    : [...todoKeys.views(), 'open'] as const,
  completed: (params?: TodoViewListParams) => params
    ? [...todoKeys.views(), 'completed', params] as const
    : [...todoKeys.views(), 'completed'] as const,
  counts: () => [...todoKeys.all, 'counts'] as const,
  detail: (id: string) => [...todoKeys.all, 'detail', id] as const,
}
