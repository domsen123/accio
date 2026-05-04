import type { SQL } from 'drizzle-orm'
import type { PgColumn, PgTable, TableConfig } from 'drizzle-orm/pg-core'
import type { EventBus } from '../events'
import type { DatabaseClient } from './client'
import {
  and,
  asc,
  count,
  desc,
  eq,
  getTableColumns,
  gt,
  gte,
  ilike,
  inArray,
  isNotNull,
  isNull,
  like,
  lt,
  lte,
  ne,
  notInArray,
  or,
} from 'drizzle-orm'
import { ulid } from 'ulid'
import { buildEventKey } from '../events'

// Type helpers
type SelectModel<T extends PgTable<TableConfig>> = T['$inferSelect']
type InsertModel<T extends PgTable<TableConfig>> = T['$inferInsert']
type InsertData<T extends PgTable<TableConfig>> = Omit<InsertModel<T>, 'id' | 'createdAt' | 'updatedAt'>
type UpdateData<T extends PgTable<TableConfig>> = Partial<Omit<InsertModel<T>, 'id' | 'createdAt'>>

// Filter operator types
interface FilterOperator<T> {
  _eq?: T
  _neq?: T
  _gt?: T
  _gte?: T
  _lt?: T
  _lte?: T
  _in?: T[]
  _nin?: T[]
  _like?: string
  _ilike?: string
  _null?: boolean
  _nnull?: boolean
}

// Field filter: each field can have operators or direct value (= _eq)
type FieldFilter<T> = {
  [K in keyof T]?: FilterOperator<T[K]> | T[K]
}

// Logical operators
interface LogicalFilter<T> {
  _and?: Filter<T>[]
  _or?: Filter<T>[]
}

// Combined filter type
export type Filter<T> = FieldFilter<T> & LogicalFilter<T>

// Field selection types (Directus-style string array)
type FieldsOption = string[] // ['id', 'name', '-password', 'author.name']

// Sort options (Directus-style: 'name' for ASC, '-name' for DESC)
type SortOption = string[] // ['name', '-createdAt'] -> name ASC, createdAt DESC

interface ParsedFields {
  include: Set<string>
  exclude: Set<string>
  relations: Map<string, string[]> // Prepared for Phase 2
}

// Parse fields array into include/exclude sets
const parseFields = (fields: string[]): ParsedFields => {
  const include = new Set<string>()
  const exclude = new Set<string>()
  const relations = new Map<string, string[]>()

  for (const field of fields) {
    if (field.startsWith('-')) {
      exclude.add(field.slice(1))
    }
    else if (field.includes('.')) {
      // Relation fields like 'author.name' or 'members.user.name'
      const parts = field.split('.')
      const relation = parts[0]
      const nested = parts.slice(1).join('.')
      if (relation && nested) {
        if (!relations.has(relation))
          relations.set(relation, [])
        relations.get(relation)!.push(nested)
      }
    }
    else if (field === '*') {
      // Wildcard for all fields - handled by not specifying columns
      continue
    }
    else {
      include.add(field)
    }
  }

  return { include, exclude, relations }
}

// Relational query config for Drizzle's db.query API
interface RelationalQueryConfig {
  columns?: Record<string, boolean>
  with?: Record<string, RelationalQueryConfig | true>
}

// Recursively build relational query config from fields array
const buildRelationalQuery = (fields: string[]): RelationalQueryConfig => {
  const config: RelationalQueryConfig = {}
  const columns: Record<string, boolean> = {}
  const relations = new Map<string, string[]>()

  for (const field of fields) {
    if (field === '*') {
      // Wildcard for all columns - don't specify columns (Drizzle returns all)
      continue
    }
    else if (field.includes('.')) {
      // Relation field: 'organisation.name' or 'members.user.name'
      const parts = field.split('.')
      const relation = parts[0]
      const rest = parts.slice(1).join('.')
      if (relation && rest) {
        if (!relations.has(relation))
          relations.set(relation, [])
        relations.get(relation)!.push(rest)
      }
    }
    else {
      // Direct column
      columns[field] = true
    }
  }

  // Add columns if any specified
  if (Object.keys(columns).length > 0) {
    config.columns = columns
  }

  // Recursively build nested relations
  if (relations.size > 0) {
    config.with = {}
    for (const [relation, nestedFields] of relations) {
      if (nestedFields.length === 1 && nestedFields[0] === '*') {
        // Wildcard: include all columns from relation
        config.with[relation] = true
      }
      else {
        // Recursively build nested config
        config.with[relation] = buildRelationalQuery(nestedFields)
      }
    }
  }

  return config
}

// Check if fields contain any relation requests
const hasRelationFields = (fields?: string[]): boolean => {
  if (!fields)
    return false
  return fields.some(f => f.includes('.'))
}

// Build column selection object from fields array
const buildColumnSelection = <T extends PgTable<TableConfig>>(
  table: T,
  fields?: FieldsOption,
): Record<string, PgColumn> | undefined => {
  if (!fields || fields.length === 0)
    return undefined // Select all

  const allColumns = getTableColumns(table) as Record<string, PgColumn>
  const { include, exclude } = parseFields(fields)

  // Include mode: only specified fields
  if (include.size > 0) {
    const selected: Record<string, PgColumn> = {}
    for (const field of include) {
      if (allColumns[field]) {
        selected[field] = allColumns[field]
      }
    }
    return Object.keys(selected).length > 0 ? selected : undefined
  }

  // Exclude mode: all fields except excluded
  if (exclude.size > 0) {
    const selected = { ...allColumns }
    for (const field of exclude) {
      delete selected[field]
    }
    return selected
  }

  return undefined
}

interface QueryOptions<T> {
  filter?: Filter<T>
  fields?: FieldsOption
  sort?: SortOption
  limit?: number
  offset?: number
}

interface CreateItemServiceDeps<T extends PgTable<TableConfig>> {
  db: DatabaseClient
  table: T
  tableName?: string // Used for relation fetching and event emission
  eventBus?: EventBus
}

export const createItemService = <T extends PgTable<TableConfig>>({
  db,
  table,
  tableName,
  eventBus,
}: CreateItemServiceDeps<T>) => {
  type Select = SelectModel<T>
  type Insert = InsertData<T>
  type Update = UpdateData<T>

  const idColumn = (table as any).id as PgColumn

  // Event emission helper
  const emitEvent = (
    operation: 'created' | 'updated' | 'deleted',
    data: Select | Select[],
  ) => {
    if (!eventBus || !tableName)
      return
    const key = buildEventKey(tableName, operation)
    eventBus.emit(key, {
      tableName,
      operation,
      timestamp: new Date(),
      data,
      metadata: Array.isArray(data)
        ? { count: data.length, ids: data.map((d: any) => d.id) }
        : undefined,
    })
  }

  // Build SQL WHERE clause from filter object
  const buildWhereClause = (filter: Filter<Select>): SQL | undefined => {
    const conditions: SQL[] = []

    // Handle _and
    if (filter._and && filter._and.length > 0) {
      const andConditions = filter._and
        .map(f => buildWhereClause(f))
        .filter((c): c is SQL => c !== undefined)
      if (andConditions.length > 0) {
        conditions.push(and(...andConditions)!)
      }
    }

    // Handle _or
    if (filter._or && filter._or.length > 0) {
      const orConditions = filter._or
        .map(f => buildWhereClause(f))
        .filter((c): c is SQL => c !== undefined)
      if (orConditions.length > 0) {
        conditions.push(or(...orConditions)!)
      }
    }

    // Handle field conditions
    for (const [fieldName, fieldValue] of Object.entries(filter)) {
      if (fieldName === '_and' || fieldName === '_or')
        continue

      const column = (table as any)[fieldName] as PgColumn | undefined
      if (!column)
        continue

      // Direct value = equality
      if (fieldValue !== null && typeof fieldValue !== 'object') {
        conditions.push(eq(column, fieldValue))
        continue
      }

      // Object with operators
      if (fieldValue && typeof fieldValue === 'object') {
        const ops = fieldValue as FilterOperator<unknown>
        if (ops._eq !== undefined)
          conditions.push(eq(column, ops._eq))
        if (ops._neq !== undefined)
          conditions.push(ne(column, ops._neq))
        if (ops._gt !== undefined)
          conditions.push(gt(column, ops._gt))
        if (ops._gte !== undefined)
          conditions.push(gte(column, ops._gte))
        if (ops._lt !== undefined)
          conditions.push(lt(column, ops._lt))
        if (ops._lte !== undefined)
          conditions.push(lte(column, ops._lte))
        if (ops._in !== undefined)
          conditions.push(inArray(column, ops._in as any[]))
        if (ops._nin !== undefined)
          conditions.push(notInArray(column, ops._nin as any[]))
        if (ops._like !== undefined)
          conditions.push(like(column, ops._like))
        if (ops._ilike !== undefined)
          conditions.push(ilike(column, ops._ilike))
        if (ops._null === true)
          conditions.push(isNull(column))
        if (ops._null === false)
          conditions.push(isNotNull(column))
        if (ops._nnull === true)
          conditions.push(isNotNull(column))
        if (ops._nnull === false)
          conditions.push(isNull(column))
      }
    }

    if (conditions.length === 0)
      return undefined
    if (conditions.length === 1)
      return conditions[0]
    return and(...conditions)
  }

  // Build ORDER BY clause from sort array
  const buildOrderByClause = (sortFields: string[]): SQL[] => {
    const orderBy: SQL[] = []
    for (const field of sortFields) {
      const isDesc = field.startsWith('-')
      const fieldName = isDesc ? field.slice(1) : field
      const column = (table as any)[fieldName] as PgColumn | undefined
      if (column) {
        orderBy.push(isDesc ? desc(column) : asc(column))
      }
    }
    return orderBy
  }

  const findMany = async (options: QueryOptions<Select> = {}): Promise<Select[]> => {
    // Check if relations are requested
    if (hasRelationFields(options.fields) && tableName) {
      // Use Drizzle's relational query API for relation support
      const queryConfig = buildRelationalQuery(options.fields!)
      const queryBuilder = (db.query as any)[tableName]

      if (!queryBuilder) {
        throw createError({
          statusCode: 500,
          statusMessage: `Table "${tableName}" not found in db.query. Ensure schema is passed to drizzle().`,
        })
      }

      return await queryBuilder.findMany({
        columns: queryConfig.columns,
        with: queryConfig.with,
        where: options.filter ? () => buildWhereClause(options.filter!) : undefined,
        orderBy: options.sort && options.sort.length > 0 ? buildOrderByClause(options.sort) : undefined,
        limit: options.limit,
        offset: options.offset,
      })
    }

    // Fall back to standard query builder (no relations)
    const columns = buildColumnSelection(table, options.fields)

    // Use selected columns or select all
    let query = columns
      ? db.select(columns).from(table as any).$dynamic()
      : db.select().from(table as any).$dynamic()

    if (options.filter) {
      const whereClause = buildWhereClause(options.filter)
      if (whereClause)
        query = query.where(whereClause)
    }

    if (options.sort && options.sort.length > 0) {
      const orderBy = buildOrderByClause(options.sort)
      if (orderBy.length > 0)
        query = query.orderBy(...orderBy)
    }

    if (options.limit !== undefined)
      query = query.limit(options.limit)
    if (options.offset !== undefined)
      query = query.offset(options.offset)

    return await query as Select[]
  }

  const findOne = async (filter: Filter<Select>): Promise<Select | null> => {
    const results = await findMany({ filter, limit: 1 })
    return results[0] ?? null
  }

  const readOne = async (id: string): Promise<Select | null> => {
    const results = await db
      .select()
      .from(table as any)
      .where(eq(idColumn, id))
      .limit(1)
    return (results[0] as Select) ?? null
  }

  const create = async (data: Insert): Promise<Select> => {
    const now = new Date()
    const [result] = await db
      .insert(table)
      .values({ id: ulid(), ...data, createdAt: now, updatedAt: now } as any)
      .returning()
    emitEvent('created', result as Select)
    return result as Select
  }

  const createMany = async (dataArray: Insert[]): Promise<Select[]> => {
    if (dataArray.length === 0)
      return []
    const now = new Date()
    const values = dataArray.map(data => ({
      id: ulid(),
      ...data,
      createdAt: now,
      updatedAt: now,
    }))
    const results = await db.insert(table).values(values as any).returning() as Select[]
    emitEvent('created', results)
    return results
  }

  const update = async (id: string, data: Update): Promise<Select> => {
    const [result] = await db
      .update(table)
      .set({ ...data, updatedAt: new Date() } as any)
      .where(eq(idColumn, id))
      .returning()
    if (!result)
      throw createError({ statusCode: 404, statusMessage: 'Record not found' })
    emitEvent('updated', result as Select)
    return result as Select
  }

  const updateMany = async (ids: string[], data: Update): Promise<Select[]> => {
    if (ids.length === 0)
      return []
    const results: Select[] = []
    for (const id of ids) {
      // Note: update() already emits individual events
      results.push(await update(id, data))
    }
    return results
  }

  const remove = async (id: string): Promise<Select> => {
    const [result] = await db.delete(table).where(eq(idColumn, id)).returning()
    if (!result)
      throw createError({ statusCode: 404, statusMessage: 'Record not found' })
    emitEvent('deleted', result as Select)
    return result as Select
  }

  const removeMany = async (ids: string[]): Promise<Select[]> => {
    if (ids.length === 0)
      return []
    const results: Select[] = []
    for (const id of ids) {
      // Note: remove() already emits individual events
      results.push(await remove(id))
    }
    return results
  }

  const countRecords = async (filter?: Filter<Select>): Promise<number> => {
    let query = db.select({ value: count() }).from(table as any).$dynamic()

    if (filter) {
      const whereClause = buildWhereClause(filter)
      if (whereClause)
        query = query.where(whereClause)
    }

    const [result] = await query
    return result?.value ?? 0
  }

  return {
    findMany,
    findOne,
    readOne,
    create,
    createMany,
    update,
    updateMany,
    delete: remove,
    deleteMany: removeMany,
    count: countRecords,
  }
}

export type ItemService<T extends PgTable<TableConfig>> = ReturnType<typeof createItemService<T>>
