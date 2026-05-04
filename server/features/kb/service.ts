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
import { and, asc, desc, eq, ilike, inArray, isNull, ne, or, sql } from 'drizzle-orm'
import * as schema from '../../database/schema'
import { resolveUniqueSlug, slugify } from './slug'

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

export interface CreateKbEntryServiceDeps {
  db: DatabaseClient
  kbEntriesItemService: ItemService<typeof kbEntries>
  kbTagService: KbTagService
}

export const createKbEntryService = (deps: CreateKbEntryServiceDeps) => {
  const { db, kbEntriesItemService, kbTagService } = deps

  /**
   * Replace the tag set for an entry. Used by both create and update.
   * Resolves tag names via `kbTagService.findOrCreate`, then rewrites the
   * junction transactionally.
   */
  const replaceTags = async (entryId: string, organisationId: string, tagNames: string[]) => {
    const uniqueNames = Array.from(
      new Map(tagNames.map(n => [n.trim().toLowerCase(), n.trim()] as const)).values(),
    ).filter(n => n.length > 0)

    const tagRows = await Promise.all(
      uniqueNames.map(name => kbTagService.findOrCreate({ organisationId, name })),
    )

    await db.transaction(async (tx) => {
      await tx.delete(schema.kbEntryTags).where(eq(schema.kbEntryTags.entryId, entryId))
      if (tagRows.length > 0) {
        await tx.insert(schema.kbEntryTags).values(
          tagRows.map(t => ({ entryId, tagId: t.id })),
        )
      }
    })

    return tagRows
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

    const status: KbEntryStatus = input.status ?? 'draft'
    const authorType: KbEntryAuthorType = input.authorType ?? 'human'
    const sourceType: KbEntrySourceType = input.sourceType ?? 'manual'

    const entry = await kbEntriesItemService.create({
      organisationId: input.organisationId,
      slug,
      title: input.title,
      bodyMd: input.body ?? '',
      categoryId: input.categoryId ?? null,
      status,
      authorType,
      authorName: input.authorName ?? '',
      sourceType,
      sourceRef: input.sourceRef ?? null,
      createdBy: input.createdBy ?? null,
    })

    if (input.tagNames && input.tagNames.length > 0) {
      await replaceTags(entry.id, input.organisationId, input.tagNames)
    }

    return entry
  }

  /**
   * Partial update. If `tagNames` is supplied the junction is replaced.
   * Slugs are intentionally stable across edits per REQ-KB-1; we do not
   * regenerate the slug when the title changes.
   */
  const update = async (id: string, patch: UpdateKbEntryInput) => {
    const existing = await kbEntriesItemService.readOne(id)
    if (!existing) {
      throw createError({ statusCode: 404, statusMessage: 'KB entry not found' })
    }

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

    const updated = Object.keys(data).length > 0
      ? await kbEntriesItemService.update(id, data)
      : existing

    if (patch.tagNames !== undefined) {
      await replaceTags(id, existing.organisationId, patch.tagNames)
    }

    return updated
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

    if (input.search) {
      // INTERIM: simple ILIKE on title/body. Real FTS lands in T-1.5.
      const pattern = `%${input.search}%`
      const searchCond = or(
        ilike(schema.kbEntries.title, pattern),
        ilike(schema.kbEntries.bodyMd, pattern),
      )
      if (searchCond)
        conditions.push(searchCond)
    }

    if (input.tagId) {
      const tagged = db
        .select({ id: schema.kbEntryTags.entryId })
        .from(schema.kbEntryTags)
        .where(eq(schema.kbEntryTags.tagId, input.tagId))
      conditions.push(inArray(schema.kbEntries.id, tagged))
    }

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

  const setStatus = async (id: string, status: KbEntryStatus) => {
    return kbEntriesItemService.update(id, { status })
  }

  const softDelete = async (id: string) => {
    return kbEntriesItemService.update(id, { deletedAt: new Date() })
  }

  const restore = async (id: string) => {
    return kbEntriesItemService.update(id, { deletedAt: null })
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

  return {
    create,
    update,
    findById: kbEntriesItemService.readOne,
    findBySlug,
    list,
    setStatus,
    softDelete,
    restore,
    linkTag,
    unlinkTag,
  }
}

export type KbEntryService = ReturnType<typeof createKbEntryService>
