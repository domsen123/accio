/**
 * Client-side Todo types — mirror the server response shapes returned by
 * `/api/todos/...` (T-2.4). Kept minimal for T-2.5; extend in later tasks
 * (T-2.6 detail/edit, T-2.7 subtask UI, T-2.8 KB↔Todo cross-display) as the
 * surface grows.
 */
import type { KbTag } from '~/features/kb/types/kb.types'

export type TodoPriority = 'low' | 'medium' | 'high' | 'urgent'

export const TODO_PRIORITIES: readonly TodoPriority[] = [
  'low',
  'medium',
  'high',
  'urgent',
] as const

export type TodoView = 'today' | 'upcoming' | 'open' | 'completed'

export const TODO_VIEWS: readonly TodoView[] = [
  'today',
  'upcoming',
  'open',
  'completed',
] as const

export interface Todo {
  id: string
  organisationId: string
  parentTodoId: string | null
  title: string
  descriptionMd: string | null
  priority: TodoPriority
  dueAt: string | null
  completedAt: string | null
  createdBy: string | null
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}

export interface TodoKbLinkSummary {
  id: string
  slug: string
  title: string
}

export interface TodoWithRelations extends Todo {
  tags: KbTag[]
  kbEntries: TodoKbLinkSummary[]
  subtaskCount: number
}

/** Shared params accepted by all canonical view endpoints. */
export interface TodoViewListParams {
  search?: string
  priority?: TodoPriority
  tagId?: string
  kbEntryId?: string
  parentTodoId?: string
  topLevel?: boolean
  limit?: number
  offset?: number
}

export interface UpcomingTodosListParams extends TodoViewListParams {
  withinDays?: number
}

/** Params accepted by `GET /api/todos`. */
export interface TodosListParams extends TodoViewListParams {
  completed?: boolean
  dueBefore?: string
  dueAfter?: string
  includeDeleted?: boolean
  sort?: string | string[]
}

export interface TodosListResponse {
  data: Todo[]
  limit: number | null
  offset: number
}

export interface UpcomingTodosListResponse extends TodosListResponse {
  withinDays: number
}

export interface TodoResponse {
  todo: Todo | TodoWithRelations
}

export interface TodoMutationResponse {
  todo: Todo
}

export interface TodoCounts {
  today: number
  upcoming: number
  open: number
  completed: number
}

export interface TodoCountsResponse {
  counts: TodoCounts
}
