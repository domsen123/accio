import type { todos } from '../../database/schema'
import type { DatabaseClient } from '../../infrastructure/database/client'
import type { ItemService } from '../../infrastructure/database/item-service'
import type { KbTagService } from '../kb/service'
import type {
  CreateTodoInput,
  ListTodosInput,
  TodoPriority,
  TodoSortField,
  TodoWithRelations,
  UpdateTodoInput,
} from './types'
import { and, asc, count, desc, eq, gte, ilike, inArray, isNotNull, isNull, lte, or, sql } from 'drizzle-orm'
import { ulid } from 'ulid'
import * as schema from '../../database/schema'
import {
  TODO_MAX_DEPTH,
  TodoCannotPurgeActiveError,
  TodoKbLinkNotFoundError,
  TodoNotFoundError,
  TodoParentNotFoundError,
  TodoSubtaskDepthExceededError,
} from './types'

// Drizzle transaction handle for our schema (mirrors KB service).
type Tx = Parameters<Parameters<DatabaseClient['transaction']>[0]>[0]

export interface CreateTodoServiceDeps {
  db: DatabaseClient
  todosItemService: ItemService<typeof todos>
  kbTagService: KbTagService
}

/**
 * Priority sort weight. Higher number = higher priority. Used by the `priority`
 * sort field in {@link createTodoService.list}.
 */
const PRIORITY_RANK: Record<TodoPriority, number> = {
  low: 1,
  medium: 2,
  high: 3,
  urgent: 4,
}

export const createTodoService = (deps: CreateTodoServiceDeps) => {
  const { db, todosItemService, kbTagService } = deps

  // -------------------------------------------------------------------------
  // Helpers — depth, tag rebuild, KB-link rebuild
  // -------------------------------------------------------------------------

  /**
   * Walk ancestors from `parentId` upward to compute the depth of the chain
   * a child placed under that parent would land at.
   *
   * Returns the depth of the would-be child (1-based: a top-level row has
   * depth 1, its child depth 2, grandchild depth 3). Mirrors the recursion as
   * a Drizzle recursive CTE so we resolve in a single round-trip and don't
   * have to JS-walk N parents.
   *
   * The CTE also enforces workspace isolation: any ancestor row outside
   * `organisationId` short-circuits the chain, which surfaces as a
   * {@link TodoParentNotFoundError} from the caller (cross-workspace parents
   * are invisible to the lookup).
   */
  const computeChildDepth = async (
    organisationId: string,
    parentTodoId: string,
  ): Promise<number> => {
    const result = await db.execute(sql`
      WITH RECURSIVE ancestors(id, parent_todo_id, depth) AS (
        SELECT id, parent_todo_id, 1
          FROM todos
          WHERE id = ${parentTodoId}
            AND organisation_id = ${organisationId}
        UNION ALL
        SELECT t.id, t.parent_todo_id, a.depth + 1
          FROM todos t
          INNER JOIN ancestors a ON t.id = a.parent_todo_id
          WHERE t.organisation_id = ${organisationId}
      )
      SELECT max(depth) AS depth FROM ancestors
    `)
    // postgres-js returns rows as a plain array; first row carries `depth`.
    const row = (result as unknown as Array<{ depth: number | null }>)[0]
    const parentDepth = row?.depth ?? null
    if (parentDepth === null) {
      // No row matched → the parent doesn't exist (or is in another workspace).
      throw new TodoParentNotFoundError(parentTodoId)
    }
    // The would-be child sits one level below the parent.
    return Number(parentDepth) + 1
  }

  /**
   * Validate placing a row under `parentTodoId` keeps the chain at or below
   * {@link TODO_MAX_DEPTH}. Throws on parent-not-found or depth-exceeded.
   * Returns silently when the placement is legal.
   */
  const assertParentAcceptsChild = async (
    organisationId: string,
    parentTodoId: string,
  ) => {
    const depth = await computeChildDepth(organisationId, parentTodoId)
    if (depth > TODO_MAX_DEPTH)
      throw new TodoSubtaskDepthExceededError(parentTodoId, depth)
  }

  /**
   * Resolve a list of tag names (unique by case-insensitive normal form)
   * into `kb_tags` rows. Mirrors `kbEntryService.resolveTagRows` — runs each
   * `findOrCreate` outside any open transaction so racing creates don't
   * deadlock on the row-level lock a transactional insert would hold.
   */
  const resolveTagRows = async (organisationId: string, tagNames: string[]) => {
    const uniqueNames = Array.from(
      new Map(tagNames.map(n => [n.trim().toLowerCase(), n.trim()] as const)).values(),
    ).filter(n => n.length > 0)
    return Promise.all(
      uniqueNames.map(name => kbTagService.findOrCreate({ organisationId, name })),
    )
  }

  /**
   * Rewrite the todo-tag junction inside an existing transaction. Caller is
   * responsible for resolving tag rows beforehand (see {@link resolveTagRows}).
   */
  const rewriteTodoTags = async (
    tx: Tx,
    todoId: string,
    tagRows: { id: string }[],
  ) => {
    await tx.delete(schema.todoTags).where(eq(schema.todoTags.todoId, todoId))
    if (tagRows.length > 0) {
      await tx.insert(schema.todoTags).values(
        tagRows.map(t => ({ todoId, tagId: t.id })),
      )
    }
  }

  /**
   * Validate that every supplied KB entry id exists in the same workspace and
   * returns the deduplicated id list. Throws {@link TodoKbLinkNotFoundError}
   * on any miss — cross-workspace links are not allowed.
   */
  const validateKbEntryIds = async (
    organisationId: string,
    entryIds: string[],
  ): Promise<string[]> => {
    const unique = Array.from(new Set(entryIds))
    if (unique.length === 0)
      return []

    const rows = await db
      .select({ id: schema.kbEntries.id })
      .from(schema.kbEntries)
      .where(
        and(
          eq(schema.kbEntries.organisationId, organisationId),
          inArray(schema.kbEntries.id, unique),
        ),
      )
    const found = new Set(rows.map(r => r.id))
    for (const id of unique) {
      if (!found.has(id))
        throw new TodoKbLinkNotFoundError(id)
    }
    return unique
  }

  /**
   * Rewrite the todo-kb-link junction inside an existing transaction. The
   * id list MUST already be validated against the workspace via
   * {@link validateKbEntryIds}.
   */
  const rewriteTodoKbLinks = async (
    tx: Tx,
    todoId: string,
    entryIds: string[],
  ) => {
    await tx.delete(schema.todoKbLinks).where(eq(schema.todoKbLinks.todoId, todoId))
    if (entryIds.length > 0) {
      await tx.insert(schema.todoKbLinks).values(
        entryIds.map(entryId => ({ todoId, entryId })),
      )
    }
  }

  // -------------------------------------------------------------------------
  // Surface
  // -------------------------------------------------------------------------

  /**
   * Create a todo. If `parentTodoId` is set, the parent is validated to be in
   * the same workspace AND to have ≤ 2 ancestors (REQ-TODO-2). Tag and KB
   * link junctions are populated transactionally.
   */
  const create = async (input: CreateTodoInput) => {
    if (!input.title || input.title.trim().length === 0)
      throw createError({ statusCode: 400, statusMessage: 'Todo title cannot be empty' })

    if (input.parentTodoId)
      await assertParentAcceptsChild(input.organisationId, input.parentTodoId)

    // Tag and KB-link resolution happens before the transaction so each
    // potentially-conflicting `findOrCreate` runs in its own short tx.
    const tagRows = input.tagNames && input.tagNames.length > 0
      ? await resolveTagRows(input.organisationId, input.tagNames)
      : []
    const kbEntryIds = input.kbEntryIds && input.kbEntryIds.length > 0
      ? await validateKbEntryIds(input.organisationId, input.kbEntryIds)
      : []

    const now = new Date()
    const todoId = ulid()

    return db.transaction(async (tx) => {
      const [row] = await tx
        .insert(schema.todos)
        .values({
          id: todoId,
          organisationId: input.organisationId,
          parentTodoId: input.parentTodoId ?? null,
          title: input.title,
          descriptionMd: input.description ?? null,
          priority: input.priority ?? 'medium',
          dueAt: input.dueAt ?? null,
          createdBy: input.createdBy ?? null,
          createdAt: now,
          updatedAt: now,
        })
        .returning()

      if (tagRows.length > 0)
        await rewriteTodoTags(tx, todoId, tagRows)
      if (kbEntryIds.length > 0)
        await rewriteTodoKbLinks(tx, todoId, kbEntryIds)

      return row
    })
  }

  /**
   * Partial update. Supplying `tagNames` replaces the tag set; supplying
   * `kbEntryIds` replaces the KB-link set. Re-parenting re-validates depth.
   */
  const update = async (id: string, patch: UpdateTodoInput) => {
    const existing = await todosItemService.readOne(id)
    if (!existing)
      throw new TodoNotFoundError(id)

    if (patch.parentTodoId !== undefined && patch.parentTodoId !== null) {
      if (patch.parentTodoId === id) {
        // Self-parent would be a free-running cycle in the recursive CTE.
        throw new TodoSubtaskDepthExceededError(patch.parentTodoId, TODO_MAX_DEPTH + 1)
      }
      await assertParentAcceptsChild(existing.organisationId, patch.parentTodoId)
    }

    const data: Record<string, unknown> = {}
    if (patch.title !== undefined) {
      if (patch.title.trim().length === 0)
        throw createError({ statusCode: 400, statusMessage: 'Todo title cannot be empty' })
      data.title = patch.title
    }
    if (patch.description !== undefined)
      data.descriptionMd = patch.description
    if (patch.priority !== undefined)
      data.priority = patch.priority
    if (patch.dueAt !== undefined)
      data.dueAt = patch.dueAt
    if (patch.parentTodoId !== undefined)
      data.parentTodoId = patch.parentTodoId

    const tagRows = patch.tagNames !== undefined
      ? await resolveTagRows(existing.organisationId, patch.tagNames)
      : null
    const kbEntryIds = patch.kbEntryIds !== undefined
      ? await validateKbEntryIds(existing.organisationId, patch.kbEntryIds)
      : null

    const willTouchTodo = Object.keys(data).length > 0
    const willTouchTags = tagRows !== null
    const willTouchLinks = kbEntryIds !== null

    if (!willTouchTodo && !willTouchTags && !willTouchLinks)
      return existing

    return db.transaction(async (tx) => {
      let updated = existing
      if (willTouchTodo) {
        const [row] = await tx
          .update(schema.todos)
          .set({ ...data, updatedAt: new Date() })
          .where(eq(schema.todos.id, id))
          .returning()
        if (!row)
          throw new TodoNotFoundError(id)
        updated = row
      }
      if (willTouchTags)
        await rewriteTodoTags(tx, id, tagRows!)
      if (willTouchLinks)
        await rewriteTodoKbLinks(tx, id, kbEntryIds!)

      return updated
    })
  }

  /**
   * Hydrate a single todo with tags, KB links, and immediate subtask count.
   * Soft-deleted rows are excluded by default.
   */
  const findById = async (input: {
    organisationId: string
    id: string
    includeDeleted?: boolean
  }): Promise<TodoWithRelations | null> => {
    const todo = await db.query.todos.findFirst({
      where: (t, { and: a, eq: e, isNull: n }) => {
        const conds = [e(t.organisationId, input.organisationId), e(t.id, input.id)]
        if (!input.includeDeleted)
          conds.push(n(t.deletedAt))
        return a(...conds)
      },
      with: {
        todoTags: { with: { tag: true } },
        kbLinks: { with: { entry: true } },
      },
    })

    if (!todo)
      return null

    const { todoTags, kbLinks, ...rest } = todo as typeof todo & {
      todoTags: Array<{ tag: typeof schema.kbTags.$inferSelect }>
      kbLinks: Array<{ entry: typeof schema.kbEntries.$inferSelect }>
    }

    const [{ value: subtaskCount } = { value: 0 }] = await db
      .select({ value: count() })
      .from(schema.todos)
      .where(
        and(
          eq(schema.todos.parentTodoId, input.id),
          isNull(schema.todos.deletedAt),
        ),
      )

    return {
      ...(rest as typeof schema.todos.$inferSelect),
      tags: todoTags.map(tt => tt.tag),
      kbEntries: kbLinks.map(kl => ({
        id: kl.entry.id,
        slug: kl.entry.slug,
        title: kl.entry.title,
      })),
      subtaskCount: Number(subtaskCount ?? 0),
    }
  }

  /**
   * List todos in a workspace with filters, search, and sort.
   *
   * Search: case-insensitive ILIKE on title and description (REQ-TODO has no
   * FTS requirement, and DESIGN-DATA does not allocate a tsvector for todos).
   *
   * `parentTodoId === null` returns top-level only (`parent_todo_id IS NULL`);
   * a string id returns that parent's direct children (NOT recursive). Pass
   * `undefined` to disable the parent filter.
   */
  const list = async (input: ListTodosInput) => {
    const conditions = [eq(schema.todos.organisationId, input.organisationId)]

    if (!input.includeDeleted)
      conditions.push(isNull(schema.todos.deletedAt))

    if (input.completed === true)
      conditions.push(isNotNull(schema.todos.completedAt))
    else if (input.completed === false)
      conditions.push(isNull(schema.todos.completedAt))

    if (input.parentTodoId === null)
      conditions.push(isNull(schema.todos.parentTodoId))
    else if (typeof input.parentTodoId === 'string')
      conditions.push(eq(schema.todos.parentTodoId, input.parentTodoId))

    if (input.priority)
      conditions.push(eq(schema.todos.priority, input.priority))

    if (input.dueBefore)
      conditions.push(lte(schema.todos.dueAt, input.dueBefore))
    if (input.dueAfter)
      conditions.push(gte(schema.todos.dueAt, input.dueAfter))

    if (input.search && input.search.trim().length > 0) {
      const pattern = `%${input.search.trim()}%`
      conditions.push(
        or(
          ilike(schema.todos.title, pattern),
          ilike(schema.todos.descriptionMd, pattern),
        )!,
      )
    }

    if (input.tagId) {
      const tagged = db
        .select({ id: schema.todoTags.todoId })
        .from(schema.todoTags)
        .where(eq(schema.todoTags.tagId, input.tagId))
      conditions.push(inArray(schema.todos.id, tagged))
    }

    if (input.kbEntryId) {
      const linked = db
        .select({ id: schema.todoKbLinks.todoId })
        .from(schema.todoKbLinks)
        .where(eq(schema.todoKbLinks.entryId, input.kbEntryId))
      conditions.push(inArray(schema.todos.id, linked))
    }

    // Default sort: created_at DESC (most recent first).
    const sortFields: TodoSortField[] = input.sort && input.sort.length > 0
      ? input.sort
      : ['-createdAt']

    const orderColumns = sortFields.flatMap((field) => {
      const isDesc = field.startsWith('-')
      const name = isDesc ? field.slice(1) : field
      if (name === 'priority') {
        // Map enum to integer rank so 'urgent' > 'high' > ... rather than
        // alphabetical order. CASE expression keeps the comparison in SQL.
        const rankExpr = sql`
          CASE ${schema.todos.priority}
            WHEN 'urgent' THEN ${PRIORITY_RANK.urgent}
            WHEN 'high'   THEN ${PRIORITY_RANK.high}
            WHEN 'medium' THEN ${PRIORITY_RANK.medium}
            WHEN 'low'    THEN ${PRIORITY_RANK.low}
            ELSE 0
          END
        `
        return [isDesc ? desc(rankExpr) : asc(rankExpr)]
      }
      const column = (schema.todos as unknown as Record<string, unknown>)[name]
      if (!column)
        return []
      return [isDesc ? desc(column as Parameters<typeof desc>[0]) : asc(column as Parameters<typeof asc>[0])]
    })

    let query = db.select().from(schema.todos).where(and(...conditions)).$dynamic()
    if (orderColumns.length > 0)
      query = query.orderBy(...orderColumns)
    if (input.limit !== undefined)
      query = query.limit(input.limit)
    if (input.offset !== undefined)
      query = query.offset(input.offset)

    return query
  }

  /**
   * Mark the todo completed. Idempotent — completing an already-completed
   * todo is a no-op (returns the existing row unchanged).
   */
  const complete = async (id: string) => {
    const existing = await todosItemService.readOne(id)
    if (!existing)
      throw new TodoNotFoundError(id)
    if (existing.completedAt !== null)
      return existing
    return todosItemService.update(id, { completedAt: new Date() })
  }

  /** Idempotent inverse of {@link complete}. */
  const uncomplete = async (id: string) => {
    const existing = await todosItemService.readOne(id)
    if (!existing)
      throw new TodoNotFoundError(id)
    if (existing.completedAt === null)
      return existing
    return todosItemService.update(id, { completedAt: null })
  }

  /**
   * Soft-delete (ADR-009). Subtasks are NOT auto-soft-deleted — children may
   * remain meaningful even after the parent is trashed. The default `list`
   * scope hides this row but keeps its descendants visible (callers wanting
   * to cascade can do so explicitly).
   */
  const softDelete = async (id: string) => {
    const existing = await todosItemService.readOne(id)
    if (!existing)
      throw new TodoNotFoundError(id)
    return todosItemService.update(id, { deletedAt: new Date() })
  }

  const restore = async (id: string) => {
    const existing = await todosItemService.readOne(id)
    if (!existing)
      throw new TodoNotFoundError(id)
    return todosItemService.update(id, { deletedAt: null })
  }

  /**
   * Hard-delete a soft-deleted todo. Cascades via schema FKs:
   *   - `todo_tags.todo_id ON DELETE CASCADE` clears tag links
   *   - `todo_kb_links.todo_id ON DELETE CASCADE` clears KB links
   *   - `todos.parent_todo_id ON DELETE CASCADE` removes any subtasks
   *
   * Throws {@link TodoCannotPurgeActiveError} for live rows — hard-delete is
   * always preceded by soft-delete (ADR-009).
   */
  const purge = async (input: { id: string, organisationId: string }) => {
    const existing = await todosItemService.readOne(input.id)
    if (!existing)
      throw new TodoNotFoundError(input.id)
    if (existing.organisationId !== input.organisationId)
      throw new TodoNotFoundError(input.id)
    if (existing.deletedAt === null)
      throw new TodoCannotPurgeActiveError(input.id)

    await db.delete(schema.todos).where(eq(schema.todos.id, input.id))
  }

  // ---------------------------------------------------------------------------
  // Junction-row helpers (idempotent)
  // ---------------------------------------------------------------------------

  const linkKb = async (input: { todoId: string, entryId: string }) => {
    const [existing] = await db
      .select()
      .from(schema.todoKbLinks)
      .where(
        and(
          eq(schema.todoKbLinks.todoId, input.todoId),
          eq(schema.todoKbLinks.entryId, input.entryId),
        ),
      )
      .limit(1)
    if (existing)
      return existing
    const [row] = await db
      .insert(schema.todoKbLinks)
      .values({ todoId: input.todoId, entryId: input.entryId })
      .returning()
    return row
  }

  const unlinkKb = async (input: { todoId: string, entryId: string }) => {
    await db
      .delete(schema.todoKbLinks)
      .where(
        and(
          eq(schema.todoKbLinks.todoId, input.todoId),
          eq(schema.todoKbLinks.entryId, input.entryId),
        ),
      )
  }

  const linkTag = async (input: { todoId: string, tagId: string }) => {
    const [existing] = await db
      .select()
      .from(schema.todoTags)
      .where(
        and(
          eq(schema.todoTags.todoId, input.todoId),
          eq(schema.todoTags.tagId, input.tagId),
        ),
      )
      .limit(1)
    if (existing)
      return existing
    const [row] = await db
      .insert(schema.todoTags)
      .values({ todoId: input.todoId, tagId: input.tagId })
      .returning()
    return row
  }

  const unlinkTag = async (input: { todoId: string, tagId: string }) => {
    await db
      .delete(schema.todoTags)
      .where(
        and(
          eq(schema.todoTags.todoId, input.todoId),
          eq(schema.todoTags.tagId, input.tagId),
        ),
      )
  }

  return {
    create,
    update,
    findById,
    list,
    complete,
    uncomplete,
    softDelete,
    restore,
    purge,
    linkKb,
    unlinkKb,
    linkTag,
    unlinkTag,
  }
}

export type TodoService = ReturnType<typeof createTodoService>
