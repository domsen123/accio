import type { kbCategories, kbEntries, kbTags } from '../../database/schema'
import type { DatabaseClient } from '../../infrastructure/database/client'
import type { ItemService } from '../../infrastructure/database/item-service'
import type {
  CreateKbEntryInput,
  KbEntryAuthorType,
  KbEntrySourceType,
  KbEntryStatus,
  KbEntryWithRelations,
  ListKbEntriesInput,
  UpdateKbEntryInput,
} from './types'
import { and, asc, desc, eq, inArray, isNotNull, isNull, ne, sql } from 'drizzle-orm'
import { ulid } from 'ulid'
import * as schema from '../../database/schema'
import { parseWikilinks } from './markdown'
import { resolveUniqueSlug, slugify } from './slug'
import {
  KB_ENTRY_STATUSES,
  KbCannotPurgeActiveError,
  KbInvalidStatusTransitionError,
} from './types'

// Drizzle transaction handle for our schema. We don't pin the dialect generic
// because db.transaction's callback type is structurally compatible.
type Tx = Parameters<Parameters<DatabaseClient['transaction']>[0]>[0]

// ---------------------------------------------------------------------------
// KB Category service
// ---------------------------------------------------------------------------

export interface CreateKbCategoryServiceDeps {
  kbCategoriesItemService: ItemService<typeof kbCategories>
}

export const createKbCategoryService = (deps: CreateKbCategoryServiceDeps) => {
  const { kbCategoriesItemService } = deps

  /**
   * Default scope filters out soft-deleted rows (ADR-009). Callers that need
   * trashed categories pass `includeDeleted: true`.
   */
  const list = async (input: { organisationId: string, includeDeleted?: boolean }) => {
    const filter: Record<string, unknown> = {
      organisationId: { _eq: input.organisationId },
    }
    if (!input.includeDeleted) {
      filter.deletedAt = { _null: true }
    }
    return kbCategoriesItemService.findMany({ filter, sort: ['name'] })
  }

  const findById = async (id: string) => {
    return kbCategoriesItemService.readOne(id)
  }

  const findOne = async (input: { organisationId: string, slug: string }) => {
    return kbCategoriesItemService.findOne({
      organisationId: { _eq: input.organisationId },
      slug: { _eq: input.slug },
      deletedAt: { _null: true },
    })
  }

  const create = async (input: {
    organisationId: string
    name: string
    slug: string
    parentId?: string | null
  }) => {
    return kbCategoriesItemService.create({
      organisationId: input.organisationId,
      name: input.name,
      slug: input.slug,
      parentId: input.parentId ?? null,
    })
  }

  const update = async (
    id: string,
    patch: Partial<{ name: string, slug: string, parentId: string | null }>,
  ) => {
    return kbCategoriesItemService.update(id, patch)
  }

  const softDelete = async (id: string) => {
    return kbCategoriesItemService.update(id, { deletedAt: new Date() })
  }

  const restore = async (id: string) => {
    return kbCategoriesItemService.update(id, { deletedAt: null })
  }

  return {
    list,
    findById,
    findOne,
    create,
    update,
    softDelete,
    restore,
  }
}

export type KbCategoryService = ReturnType<typeof createKbCategoryService>

// ---------------------------------------------------------------------------
// KB Tag service
// ---------------------------------------------------------------------------

export interface CreateKbTagServiceDeps {
  db: DatabaseClient
  kbTagsItemService: ItemService<typeof kbTags>
}

export const createKbTagService = (deps: CreateKbTagServiceDeps) => {
  const { db, kbTagsItemService } = deps

  const list = async (input: { organisationId: string, includeDeleted?: boolean }) => {
    const filter: Record<string, unknown> = {
      organisationId: { _eq: input.organisationId },
    }
    if (!input.includeDeleted) {
      filter.deletedAt = { _null: true }
    }
    return kbTagsItemService.findMany({ filter, sort: ['name'] })
  }

  const findById = async (id: string) => {
    return kbTagsItemService.readOne(id)
  }

  /**
   * Case-insensitive lookup by name within a workspace, inserting on miss.
   * ADR-008: tag names are unique per workspace, case-insensitive.
   */
  const findOrCreate = async (input: { organisationId: string, name: string }) => {
    const trimmed = input.name.trim()
    if (!trimmed) {
      throw createError({ statusCode: 400, statusMessage: 'Tag name cannot be empty' })
    }

    const [existing] = await db
      .select()
      .from(schema.kbTags)
      .where(
        and(
          eq(schema.kbTags.organisationId, input.organisationId),
          sql`lower(${schema.kbTags.name}) = lower(${trimmed})`,
          isNull(schema.kbTags.deletedAt),
        ),
      )
      .limit(1)

    if (existing) {
      return existing
    }

    return kbTagsItemService.create({
      organisationId: input.organisationId,
      name: trimmed,
    })
  }

  const softDelete = async (id: string) => {
    return kbTagsItemService.update(id, { deletedAt: new Date() })
  }

  const restore = async (id: string) => {
    return kbTagsItemService.update(id, { deletedAt: null })
  }

  return {
    list,
    findById,
    findOrCreate,
    softDelete,
    restore,
  }
}

export type KbTagService = ReturnType<typeof createKbTagService>

// ---------------------------------------------------------------------------
// KB Entry service
// ---------------------------------------------------------------------------

/**
 * Build a Postgres `to_tsquery` expression from arbitrary user input.
 *
 * Strategy (REQ-KB-5, DESIGN-DATA, DESIGN-RANK):
 *   1. Replace every tsquery operator character (`& | ! ( ) : ' < > *`) and
 *      the backslash with a space — user input is uncontrolled and any of
 *      these would crash `to_tsquery`. Spaces collapse into token boundaries.
 *   2. Tokenise on whitespace and drop empties.
 *   3. Append `:*` to each token for prefix matching, then AND them with `&`.
 *
 * Returns `null` when sanitisation yields zero tokens — callers should treat
 * this as "no match" (zero results) per the task brief, not "no search".
 */
/**
 * Validate a status transition. REQ-KB-7 lets the user transition any entry
 * between the four valid statuses, so this function's responsibility is to
 * (a) reject unknown enum values and (b) provide a single seam where future
 * business rules (e.g. "verified can't go straight back to inbox") can be
 * tightened. Same-status transitions are idempotent and always allowed.
 */
export const isValidStatusTransition = (
  from: KbEntryStatus,
  to: KbEntryStatus,
): boolean => {
  if (!KB_ENTRY_STATUSES.includes(from))
    return false
  if (!KB_ENTRY_STATUSES.includes(to))
    return false
  return true
}

export const buildTsQuery = (raw: string): string | null => {
  // Strip every operator char tsquery cares about, plus backslash. This is a
  // superset of what would crash `to_tsquery('simple', …)` so we err safe.
  const cleaned = raw.replace(/[\\&|!():'"<>*]/g, ' ')
  const tokens = cleaned.split(/\s+/).filter(t => t.length > 0)
  if (tokens.length === 0)
    return null
  return tokens.map(t => `${t}:*`).join(' & ')
}

export interface CreateKbEntryServiceDeps {
  db: DatabaseClient
  kbEntriesItemService: ItemService<typeof kbEntries>
  kbTagService: KbTagService
}

export const createKbEntryService = (deps: CreateKbEntryServiceDeps) => {
  const { db, kbEntriesItemService, kbTagService } = deps

  /**
   * Resolve a list of tag names (unique by case-insensitive normal form) into
   * `kb_tags` rows. `findOrCreate` is idempotent; we run it outside any open
   * transaction so two callers racing on the same name don't deadlock on the
   * row-level lock that a transactional insert would hold.
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
   * Rewrite the entry-tag junction inside an existing transaction. Caller is
   * responsible for resolving tag rows beforehand (see {@link resolveTagRows}).
   */
  const rewriteEntryTags = async (
    tx: Tx,
    entryId: string,
    tagRows: { id: string }[],
  ) => {
    await tx.delete(schema.kbEntryTags).where(eq(schema.kbEntryTags.entryId, entryId))
    if (tagRows.length > 0) {
      await tx.insert(schema.kbEntryTags).values(
        tagRows.map(t => ({ entryId, tagId: t.id })),
      )
    }
  }

  /**
   * Rebuild `kb_entry_links` for a single entry inside an existing transaction
   * (DESIGN-WIKILINKS step 2).
   *
   * Behaviour:
   *   - Parse the body for wikilinks.
   *   - Deduplicate by `targetSlug` so the same target is stored exactly once,
   *     even if it appears multiple times in the body.
   *   - For each unique target, look up an existing live entry in the same
   *     workspace; on hit, set `to_entry_id` and `resolved=true`. On miss the
   *     row stays unresolved (`to_entry_id IS NULL`, `resolved=false`).
   *   - Replace all existing `from_entry_id = entryId` rows wholesale — this
   *     is the canonical "rewrite on save" semantics.
   */
  const rebuildEntryLinks = async (
    tx: Tx,
    params: { entryId: string, organisationId: string, body: string },
  ) => {
    const { entryId, organisationId, body } = params
    const refs = parseWikilinks(body)
    const uniqueSlugs = Array.from(new Set(refs.map(r => r.targetSlug)))

    await tx.delete(schema.kbEntryLinks).where(eq(schema.kbEntryLinks.fromEntryId, entryId))

    if (uniqueSlugs.length === 0)
      return

    const existingTargets = await tx
      .select({ id: schema.kbEntries.id, slug: schema.kbEntries.slug })
      .from(schema.kbEntries)
      .where(
        and(
          eq(schema.kbEntries.organisationId, organisationId),
          inArray(schema.kbEntries.slug, uniqueSlugs),
          isNull(schema.kbEntries.deletedAt),
        ),
      )
    const slugToId = new Map(existingTargets.map(r => [r.slug, r.id]))

    const now = new Date()
    const rows = uniqueSlugs.map((slug) => {
      const toEntryId = slugToId.get(slug) ?? null
      return {
        id: ulid(),
        organisationId,
        fromEntryId: entryId,
        toEntryId,
        toSlug: slug,
        resolved: toEntryId !== null,
        createdAt: now,
        updatedAt: now,
      }
    })

    await tx.insert(schema.kbEntryLinks).values(rows)
  }

  /**
   * Back-fill `to_entry_id` on previously-unresolved links that pointed at
   * the slug `targetSlug` — used inside the create transaction for a fresh
   * entry so dangling references auto-heal as their target appears.
   */
  const resolveBackrefsForNewEntry = async (
    tx: Tx,
    params: { organisationId: string, slug: string, entryId: string },
  ) => {
    await tx
      .update(schema.kbEntryLinks)
      .set({
        toEntryId: params.entryId,
        resolved: true,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(schema.kbEntryLinks.organisationId, params.organisationId),
          eq(schema.kbEntryLinks.toSlug, params.slug),
          isNull(schema.kbEntryLinks.toEntryId),
        ),
      )
  }

  /**
   * Create a KB entry. Derives the slug via {@link slugify}, then resolves
   * collisions in the workspace via {@link resolveUniqueSlug} so duplicate
   * titles transparently get `-2`, `-3`, ... suffixes.
   *
   * Race note: a simultaneous create that picks the same suffix will hit the
   * `(organisation_id, slug)` unique constraint and bubble. This is rare in
   * single-user dev and we deliberately don't add transactional locking.
   */
  const create = async (input: CreateKbEntryInput) => {
    const base = slugify(input.title)
    const slug = await resolveUniqueSlug({
      db,
      organisationId: input.organisationId,
      base,
    })

    const authorType: KbEntryAuthorType = input.authorType ?? 'human'
    // ADR-007: AI-authored entries default to `inbox` so the user can triage
    // them; human-authored entries default to `draft`. Caller-supplied status
    // wins in both cases.
    const status: KbEntryStatus = input.status ?? (authorType === 'ai' ? 'inbox' : 'draft')
    const sourceType: KbEntrySourceType = input.sourceType ?? 'manual'
    const body = input.body ?? ''

    // Resolve tag rows up-front (each `findOrCreate` is its own short tx)
    // before opening the entry-creation transaction. Keeps lock scope small.
    const tagRows = input.tagNames && input.tagNames.length > 0
      ? await resolveTagRows(input.organisationId, input.tagNames)
      : []

    const now = new Date()
    const entryId = ulid()

    const entry = await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(schema.kbEntries)
        .values({
          id: entryId,
          organisationId: input.organisationId,
          slug,
          title: input.title,
          bodyMd: body,
          categoryId: input.categoryId ?? null,
          status,
          authorType,
          authorName: input.authorName ?? '',
          sourceType,
          sourceRef: input.sourceRef ?? null,
          createdBy: input.createdBy ?? null,
          createdAt: now,
          updatedAt: now,
        })
        .returning()

      if (tagRows.length > 0)
        await rewriteEntryTags(tx, entryId, tagRows)

      // Outgoing wikilinks for this entry's body.
      await rebuildEntryLinks(tx, { entryId, organisationId: input.organisationId, body })

      // Auto-heal: any pre-existing unresolved link pointing at this slug.
      await resolveBackrefsForNewEntry(tx, {
        organisationId: input.organisationId,
        slug,
        entryId,
      })

      return row
    })

    return entry
  }

  /**
   * Assert that `to` is a valid transition from `from`, throwing
   * {@link KbInvalidStatusTransitionError} otherwise. Shared between
   * {@link setStatus} and {@link update} so the rule lives in one place.
   */
  const assertValidStatusTransition = (
    from: KbEntryStatus,
    to: KbEntryStatus,
  ) => {
    if (!isValidStatusTransition(from, to))
      throw new KbInvalidStatusTransitionError(from, to)
  }

  /**
   * Partial update. If `tagNames` is supplied the junction is replaced.
   * Slugs are intentionally stable across edits per REQ-KB-1; we do not
   * regenerate the slug when the title changes.
   *
   * If `status` is supplied it is validated against
   * {@link isValidStatusTransition} — the same gate as {@link setStatus}.
   */
  const update = async (id: string, patch: UpdateKbEntryInput) => {
    const existing = await kbEntriesItemService.readOne(id)
    if (!existing) {
      throw createError({ statusCode: 404, statusMessage: 'KB entry not found' })
    }

    if (patch.status !== undefined)
      assertValidStatusTransition(existing.status as KbEntryStatus, patch.status)

    const data: Record<string, unknown> = {}
    if (patch.title !== undefined)
      data.title = patch.title
    if (patch.body !== undefined)
      data.bodyMd = patch.body
    if (patch.categoryId !== undefined)
      data.categoryId = patch.categoryId
    if (patch.status !== undefined)
      data.status = patch.status
    if (patch.authorType !== undefined)
      data.authorType = patch.authorType
    if (patch.authorName !== undefined)
      data.authorName = patch.authorName
    if (patch.sourceType !== undefined)
      data.sourceType = patch.sourceType
    if (patch.sourceRef !== undefined)
      data.sourceRef = patch.sourceRef

    // Resolve tag rows outside the transaction (see {@link resolveTagRows}).
    const tagRows = patch.tagNames !== undefined
      ? await resolveTagRows(existing.organisationId, patch.tagNames)
      : null

    const willTouchEntry = Object.keys(data).length > 0
    const willTouchTags = tagRows !== null
    const willRebuildLinks = patch.body !== undefined

    if (!willTouchEntry && !willTouchTags && !willRebuildLinks)
      return existing

    return db.transaction(async (tx) => {
      let updated = existing
      if (willTouchEntry) {
        const [row] = await tx
          .update(schema.kbEntries)
          .set({ ...data, updatedAt: new Date() })
          .where(eq(schema.kbEntries.id, id))
          .returning()
        if (!row)
          throw createError({ statusCode: 404, statusMessage: 'KB entry not found' })
        updated = row
      }

      if (willTouchTags)
        await rewriteEntryTags(tx, id, tagRows!)

      if (willRebuildLinks) {
        await rebuildEntryLinks(tx, {
          entryId: id,
          organisationId: existing.organisationId,
          body: patch.body ?? '',
        })
      }

      return updated
    })
  }

  /**
   * Find a single entry by its workspace + slug. Returns the entry along
   * with its category (if any) and resolved tags. Honours soft delete.
   */
  const findBySlug = async (input: {
    organisationId: string
    slug: string
    includeDeleted?: boolean
  }): Promise<KbEntryWithRelations | null> => {
    const entry = await db.query.kbEntries.findFirst({
      where: (e, { and: a, eq: e2, isNull: n }) => {
        const conds = [
          e2(e.organisationId, input.organisationId),
          e2(e.slug, input.slug),
        ]
        if (!input.includeDeleted)
          conds.push(n(e.deletedAt))
        return a(...conds)
      },
      with: {
        category: true,
        entryTags: {
          with: { tag: true },
        },
      },
    })

    if (!entry)
      return null

    const { entryTags, category, ...rest } = entry as typeof entry & {
      entryTags: Array<{ tag: typeof schema.kbTags.$inferSelect }>
      category: typeof schema.kbCategories.$inferSelect | null
    }

    return {
      ...(rest as typeof schema.kbEntries.$inferSelect),
      category: category ?? null,
      tags: entryTags.map(et => et.tag),
    }
  }

  /**
   * List KB entries with filters, optional FTS, sort, and pagination.
   *
   * Routing decision (T-1.5): there is exactly ONE entry point for the API
   * layer. When `search` is a non-empty string, `list` routes through the
   * Postgres full-text search path (REQ-KB-5):
   *   - tsquery built from sanitised tokens with prefix matching (`:*`)
   *   - match condition `body_search @@ to_tsquery('simple', …)`
   *   - rank via `ts_rank_cd(body_search, …)` (cover-density, proximity-aware)
   *   - results ordered by rank DESC, `created_at` DESC tiebreaker
   *
   * The tsvector column is `setweight(title,'A') || setweight(body,'B')`, so
   * title matches naturally rank above body matches (DESIGN-DATA §KB).
   *
   * Edge cases:
   *   - whitespace-only `search` → behaves as if `search` was unset
   *   - search yielding zero tokens after sanitisation (e.g. `"!()"`) → returns
   *     zero results without running the query (no false matches, no crash)
   */
  const list = async (input: ListKbEntriesInput) => {
    const conditions = [eq(schema.kbEntries.organisationId, input.organisationId)]

    if (!input.includeDeleted)
      conditions.push(isNull(schema.kbEntries.deletedAt))

    if (input.status) {
      const statuses = Array.isArray(input.status) ? input.status : [input.status]
      conditions.push(inArray(schema.kbEntries.status, statuses))
    }
    else if (!input.includeArchived) {
      conditions.push(ne(schema.kbEntries.status, 'archived'))
    }

    if (input.categoryId)
      conditions.push(eq(schema.kbEntries.categoryId, input.categoryId))

    if (input.authorType)
      conditions.push(eq(schema.kbEntries.authorType, input.authorType))

    if (input.sourceType)
      conditions.push(eq(schema.kbEntries.sourceType, input.sourceType))

    if (input.tagId) {
      const tagged = db
        .select({ id: schema.kbEntryTags.entryId })
        .from(schema.kbEntryTags)
        .where(eq(schema.kbEntryTags.tagId, input.tagId))
      conditions.push(inArray(schema.kbEntries.id, tagged))
    }

    // FTS routing: a non-empty `search` after trimming activates the FTS path.
    const trimmed = input.search?.trim() ?? ''
    if (trimmed.length > 0) {
      const tsquery = buildTsQuery(trimmed)
      // Sanitised to nothing → zero results (no false matches, no crash).
      if (tsquery === null)
        return [] as (typeof schema.kbEntries.$inferSelect)[]

      conditions.push(sql`${schema.kbEntries.bodySearch} @@ to_tsquery('simple', ${tsquery})`)

      const rankExpr = sql`ts_rank_cd(${schema.kbEntries.bodySearch}, to_tsquery('simple', ${tsquery}))`

      let query = db
        .select()
        .from(schema.kbEntries)
        .where(and(...conditions))
        .orderBy(desc(rankExpr), desc(schema.kbEntries.createdAt))
        .$dynamic()
      if (input.limit !== undefined)
        query = query.limit(input.limit)
      if (input.offset !== undefined)
        query = query.offset(input.offset)
      return query
    }

    // Non-search path: honour caller-supplied sort, default to `-updatedAt`.
    const sortFields = input.sort && input.sort.length > 0 ? input.sort : ['-updatedAt']
    const orderColumns = sortFields.flatMap((field) => {
      const isDesc = field.startsWith('-')
      const name = isDesc ? field.slice(1) : field
      const column = (schema.kbEntries as unknown as Record<string, unknown>)[name]
      if (!column)
        return []
      return [isDesc ? desc(column as Parameters<typeof desc>[0]) : asc(column as Parameters<typeof asc>[0])]
    })

    let query = db.select().from(schema.kbEntries).where(and(...conditions)).$dynamic()
    if (orderColumns.length > 0)
      query = query.orderBy(...orderColumns)
    if (input.limit !== undefined)
      query = query.limit(input.limit)
    if (input.offset !== undefined)
      query = query.offset(input.offset)

    return query
  }

  /**
   * Move an entry to a new status, enforcing
   * {@link isValidStatusTransition}. Same-status calls are idempotent.
   */
  const setStatus = async (id: string, status: KbEntryStatus) => {
    const existing = await kbEntriesItemService.readOne(id)
    if (!existing)
      throw createError({ statusCode: 404, statusMessage: 'KB entry not found' })
    assertValidStatusTransition(existing.status as KbEntryStatus, status)
    return kbEntriesItemService.update(id, { status })
  }

  const softDelete = async (id: string) => {
    return kbEntriesItemService.update(id, { deletedAt: new Date() })
  }

  const restore = async (id: string) => {
    return kbEntriesItemService.update(id, { deletedAt: null })
  }

  /**
   * Hard-delete a KB entry. The ONLY hard-delete entry point in the system
   * (ADR-009): orchestrator/AI tools must never call this — only the user-
   * driven Trash UI (T-1.10) does. The runtime guard here is "must already be
   * soft-deleted"; an additional RBAC guard at the API layer is added in T-1.7.
   *
   * Junction tables (`kb_entry_tags`, `kb_entry_links.from_entry_id`) cascade
   * via the schema's `ON DELETE CASCADE`. Inbound links
   * (`kb_entry_links.to_entry_id`) flip to NULL via `ON DELETE SET NULL`.
   */
  const purge = async (input: { id: string, organisationId: string }) => {
    const existing = await kbEntriesItemService.readOne(input.id)
    if (!existing)
      throw createError({ statusCode: 404, statusMessage: 'KB entry not found' })
    if (existing.organisationId !== input.organisationId)
      throw createError({ statusCode: 404, statusMessage: 'KB entry not found' })
    if (existing.deletedAt === null)
      throw new KbCannotPurgeActiveError(input.id)

    await db.delete(schema.kbEntries).where(eq(schema.kbEntries.id, input.id))
  }

  /**
   * Hydrate a list of entries with their category and tags. Mirrors the shape
   * returned by {@link findBySlug} so list consumers and detail consumers
   * share a single relational shape.
   */
  const hydrateRelations = async (
    entryIds: string[],
  ): Promise<KbEntryWithRelations[]> => {
    if (entryIds.length === 0)
      return []

    const rows = await db.query.kbEntries.findMany({
      where: (e, { inArray: ia }) => ia(e.id, entryIds),
      with: {
        category: true,
        entryTags: {
          with: { tag: true },
        },
      },
    })

    const byId = new Map(rows.map((row) => {
      const { entryTags, category, ...rest } = row as typeof row & {
        entryTags: Array<{ tag: typeof schema.kbTags.$inferSelect }>
        category: typeof schema.kbCategories.$inferSelect | null
      }
      const hydrated: KbEntryWithRelations = {
        ...(rest as typeof schema.kbEntries.$inferSelect),
        category: category ?? null,
        tags: entryTags.map(et => et.tag),
      }
      return [row.id, hydrated] as const
    }))

    // Preserve the input order — callers rely on the sort produced by their
    // upstream query (e.g. created_at desc for inbox, deleted_at desc for trash).
    return entryIds.flatMap((id) => {
      const hit = byId.get(id)
      return hit ? [hit] : []
    })
  }

  /**
   * Inbox view (REQ-KB-8): live entries with status `inbox`, sorted by
   * `created_at desc`. Returns hydrated entries (category + tags).
   */
  const listInbox = async (input: {
    organisationId: string
    limit?: number
    offset?: number
  }): Promise<KbEntryWithRelations[]> => {
    let q = db
      .select({ id: schema.kbEntries.id })
      .from(schema.kbEntries)
      .where(and(
        eq(schema.kbEntries.organisationId, input.organisationId),
        eq(schema.kbEntries.status, 'inbox'),
        isNull(schema.kbEntries.deletedAt),
      ))
      .orderBy(desc(schema.kbEntries.createdAt))
      .$dynamic()
    if (input.limit !== undefined)
      q = q.limit(input.limit)
    if (input.offset !== undefined)
      q = q.offset(input.offset)

    const ids = (await q).map(r => r.id)
    return hydrateRelations(ids)
  }

  /**
   * Trash view (REQ-KB-9): soft-deleted entries regardless of status, sorted
   * by `deleted_at desc`. Returns hydrated entries.
   */
  const listTrash = async (input: {
    organisationId: string
    limit?: number
    offset?: number
  }): Promise<KbEntryWithRelations[]> => {
    let q = db
      .select({ id: schema.kbEntries.id })
      .from(schema.kbEntries)
      .where(and(
        eq(schema.kbEntries.organisationId, input.organisationId),
        isNotNull(schema.kbEntries.deletedAt),
      ))
      .orderBy(desc(schema.kbEntries.deletedAt))
      .$dynamic()
    if (input.limit !== undefined)
      q = q.limit(input.limit)
    if (input.offset !== undefined)
      q = q.offset(input.offset)

    const ids = (await q).map(r => r.id)
    return hydrateRelations(ids)
  }

  const linkTag = async (input: { entryId: string, tagId: string }) => {
    const [existing] = await db
      .select()
      .from(schema.kbEntryTags)
      .where(
        and(
          eq(schema.kbEntryTags.entryId, input.entryId),
          eq(schema.kbEntryTags.tagId, input.tagId),
        ),
      )
      .limit(1)
    if (existing)
      return existing

    const [row] = await db
      .insert(schema.kbEntryTags)
      .values({ entryId: input.entryId, tagId: input.tagId })
      .returning()
    return row
  }

  const unlinkTag = async (input: { entryId: string, tagId: string }) => {
    await db
      .delete(schema.kbEntryTags)
      .where(
        and(
          eq(schema.kbEntryTags.entryId, input.entryId),
          eq(schema.kbEntryTags.tagId, input.tagId),
        ),
      )
  }

  /**
   * Resolved entries that link to the given target entry (REQ-KB-4 backlinks).
   * Soft-deleted source entries are excluded by default — backlinks shouldn't
   * surface trashed authors. The link rows themselves are kept in place even
   * when the source is deleted, so a restore reinstates the backlink.
   */
  const getBacklinks = async (input: {
    organisationId: string
    entryId: string
    includeDeleted?: boolean
  }): Promise<Array<{ id: string, slug: string, title: string }>> => {
    const conditions = [
      eq(schema.kbEntryLinks.organisationId, input.organisationId),
      eq(schema.kbEntryLinks.toEntryId, input.entryId),
    ]
    if (!input.includeDeleted)
      conditions.push(isNull(schema.kbEntries.deletedAt))

    return db
      .select({
        id: schema.kbEntries.id,
        slug: schema.kbEntries.slug,
        title: schema.kbEntries.title,
      })
      .from(schema.kbEntryLinks)
      .innerJoin(
        schema.kbEntries,
        eq(schema.kbEntryLinks.fromEntryId, schema.kbEntries.id),
      )
      .where(and(...conditions))
      .orderBy(asc(schema.kbEntries.title))
  }

  return {
    create,
    update,
    findById: kbEntriesItemService.readOne,
    findBySlug,
    list,
    listInbox,
    listTrash,
    setStatus,
    softDelete,
    restore,
    purge,
    linkTag,
    unlinkTag,
    getBacklinks,
  }
}

export type KbEntryService = ReturnType<typeof createKbEntryService>
