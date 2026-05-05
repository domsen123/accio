import type { KbEntry, KbTag, Todo } from '../../database/schema'

export type TodoPriority = 'low' | 'medium' | 'high' | 'urgent'

export const TODO_PRIORITIES: readonly TodoPriority[] = [
  'low',
  'medium',
  'high',
  'urgent',
] as const

/** Maximum allowed nesting depth for subtasks (REQ-TODO-2). */
export const TODO_MAX_DEPTH = 3

/**
 * Thrown by {@link createTodoService.create} / {@link createTodoService.update}
 * when assigning `parentTodoId` would push the resulting chain past
 * {@link TODO_MAX_DEPTH}. REQ-TODO-2 caps subtask nesting at depth 3 (root +
 * two levels of children).
 */
export class TodoSubtaskDepthExceededError extends Error {
  readonly parentTodoId: string
  readonly attemptedDepth: number
  readonly maxDepth: number
  constructor(parentTodoId: string, attemptedDepth: number) {
    super(
      `Cannot attach todo under parent "${parentTodoId}": depth ${attemptedDepth} exceeds max ${TODO_MAX_DEPTH}`,
    )
    this.name = 'TodoSubtaskDepthExceededError'
    this.parentTodoId = parentTodoId
    this.attemptedDepth = attemptedDepth
    this.maxDepth = TODO_MAX_DEPTH
  }
}

/**
 * Thrown when a parent todo referenced via `parentTodoId` does not exist in
 * the same workspace as the child being created/updated. Cross-workspace
 * parents would breach REQ-WS-2 data isolation.
 */
export class TodoParentNotFoundError extends Error {
  readonly parentTodoId: string
  constructor(parentTodoId: string) {
    super(`Parent todo "${parentTodoId}" not found in workspace`)
    this.name = 'TodoParentNotFoundError'
    this.parentTodoId = parentTodoId
  }
}

/**
 * Thrown when a `kbEntryIds` value references a KB entry that doesn't exist in
 * the same workspace as the todo. Cross-workspace links would breach
 * REQ-WS-2 data isolation.
 */
export class TodoKbLinkNotFoundError extends Error {
  readonly entryId: string
  constructor(entryId: string) {
    super(`KB entry "${entryId}" not found in workspace`)
    this.name = 'TodoKbLinkNotFoundError'
    this.entryId = entryId
  }
}

/** Thrown when a todo lookup returns nothing (or is in another workspace). */
export class TodoNotFoundError extends Error {
  readonly todoId: string
  constructor(todoId: string) {
    super(`Todo "${todoId}" not found`)
    this.name = 'TodoNotFoundError'
    this.todoId = todoId
  }
}

/**
 * Thrown by {@link createTodoService.purge} when the caller tries to hard-
 * delete a todo that is still live (i.e. `deleted_at IS NULL`). Mirrors
 * {@link KbCannotPurgeActiveError} — hard-delete must always be preceded by a
 * soft-delete (ADR-009).
 */
export class TodoCannotPurgeActiveError extends Error {
  readonly todoId: string
  constructor(todoId: string) {
    super(`Cannot purge todo "${todoId}": todo is not soft-deleted`)
    this.name = 'TodoCannotPurgeActiveError'
    this.todoId = todoId
  }
}

export interface CreateTodoInput {
  organisationId: string
  title: string
  description?: string | null
  priority?: TodoPriority
  dueAt?: Date | null
  parentTodoId?: string | null
  tagNames?: string[]
  kbEntryIds?: string[]
  createdBy?: string | null
}

export interface UpdateTodoInput {
  title?: string
  description?: string | null
  priority?: TodoPriority
  dueAt?: Date | null
  parentTodoId?: string | null
  tagNames?: string[]
  kbEntryIds?: string[]
}

/** Non-recursive sort directives accepted by {@link createTodoService.list}. */
export type TodoSortField
  = | 'createdAt'
    | '-createdAt'
    | 'dueAt'
    | '-dueAt'
    | 'priority'
    | '-priority'
    | 'updatedAt'
    | '-updatedAt'

export interface ListTodosInput {
  organisationId: string
  /**
   * `true`  → only completed todos
   * `false` → only active (not-completed) todos
   * `undefined` → no filter on completion state
   */
  completed?: boolean
  /**
   * `null`       → top-level todos only (`parent_todo_id IS NULL`)
   * `undefined`  → no filter on parent
   * `<id>`       → only direct children of that todo (NOT recursive)
   */
  parentTodoId?: string | null
  priority?: TodoPriority
  tagId?: string
  kbEntryId?: string
  /** Case-insensitive ILIKE match on title and description. */
  search?: string
  dueBefore?: Date
  dueAfter?: Date
  includeDeleted?: boolean
  limit?: number
  offset?: number
  sort?: TodoSortField[]
}

/**
 * Hydrated todo shape returned by {@link createTodoService.findById}: the row
 * itself plus its tag set, linked KB entries, and a count of immediate
 * subtasks (the parent's `n/m` progress is computed in T-2.3 — the count is
 * the denominator).
 */
export interface TodoWithRelations extends Todo {
  tags: KbTag[]
  kbEntries: Pick<KbEntry, 'id' | 'slug' | 'title'>[]
  subtaskCount: number
}

/**
 * Shared input shape for the canonical views (today / open / completed).
 * Each view hard-codes its own date / completion predicate, so callers
 * cannot pass `completed`, `dueBefore`, `dueAfter`, `includeDeleted`, or
 * `sort` here — everything else (tag / priority / kb-link / search /
 * pagination) composes with the view.
 */
export interface ListTodoViewInput {
  organisationId: string
  priority?: TodoPriority
  tagId?: string
  kbEntryId?: string
  parentTodoId?: string | null
  search?: string
  limit?: number
  offset?: number
}

/**
 * Upcoming view input — same as {@link ListTodoViewInput} plus an opt-in
 * lookahead window (defaults to 7 days, REQ-TODO-4).
 */
export interface ListUpcomingTodosInput extends ListTodoViewInput {
  /**
   * Inclusive upper bound on `due_at::date` relative to today. Defaults to 7.
   * `withinDays: 14` therefore returns todos due in the next 14 days
   * (excluding today/overdue).
   */
  withinDays?: number
}

/** Aggregate counts for the four canonical views — useful for tab badges. */
export interface TodoViewCounts {
  today: number
  upcoming: number
  open: number
  completed: number
}
