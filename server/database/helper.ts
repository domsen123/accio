import type { SQL } from 'drizzle-orm'
import type { PgColumn, PgTable, TableConfig } from 'drizzle-orm/pg-core'
import type { DatabaseClient } from '../infrastructure/database/client'
import { and, eq, ilike, or, sql } from 'drizzle-orm'
import { getDatabase } from '../infrastructure/database/client'

type TableWithSlug = PgTable<TableConfig> & {
  slug: PgColumn
}

export interface DatabaseConfig {
  host: string
  port: number
  user: string
  password: string
  database: string
}

/**
 * Converts database connection parameters into a PostgreSQL connection URI
 * @param config - Database configuration object
 * @returns PostgreSQL connection URI in the format: postgres://user:password@host:port/database
 */
export function buildDatabaseUri(config: DatabaseConfig): string {
  const { host, port, user, password, database } = config

  // URL encode the password to handle special characters
  const encodedPassword = encodeURIComponent(password)

  return `postgres://${user}:${encodedPassword}@${host}:${port}/${database}`
}

export const doDatabaseOperation = async <T = any>(
  action: (db: DatabaseClient) => Promise<T>,
  tx?: DatabaseClient,
) => {
  const execute = async (db: DatabaseClient) => {
    return await action(db)
  }
  return tx ? execute(tx) : getDatabase().transaction(execute)
}

/**
 * Ensures a slug is unique by checking for conflicts and appending numeric suffixes
 *
 * @param slug - The base slug to check
 * @returns Unique slug (original or with numeric suffix)
 *
 * @example
 * // If "my-club" already exists:
 * ensureUniqueSlug("my-club") // "my-club-2"
 * // If "my-club-2" also exists:
 * ensureUniqueSlug("my-club") // "my-club-3"
 */
export const ensureUniqueSlug = async (slug: string, tbl: TableWithSlug, tx?: DatabaseClient): Promise<string> =>
  doDatabaseOperation(async (db) => {
  // Check if the base slug exists
    const existingClub = await db
      .select({ slug: tbl.slug })
      .from(tbl)
      .where(eq(tbl.slug, slug))
      .limit(1)

    // If slug is unique, return it
    if (existingClub.length === 0) {
      return slug
    }

    // Find all entries with slugs matching pattern: slug, slug-2, slug-3, etc.
    const allConflictingSlugs = await db
      .select({ slug: tbl.slug })
      .from(tbl)
      .where(sql`${tbl.slug} ~ ${`^${slug}(-\\d+)?$`}`)

    // Extract numeric suffixes and find the highest number
    let highestSuffix = 1
    for (const existingSlug of allConflictingSlugs) {
      const slugValue = existingSlug.slug as string
      const match = slugValue.match(new RegExp(`^${slug}-(\\d+)$`))
      if (match && match[1]) {
        const suffix = Number.parseInt(match[1], 10)
        if (suffix > highestSuffix) {
          highestSuffix = suffix
        }
      }
    }

    // Return slug with next available number
    return `${slug}-${highestSuffix + 1}`
  }, tx)

/**
 * Builds a search filter for multiple columns and search terms.
 * - OR between columns (term can match any column)
 * - AND between search parts (all words must be found somewhere)
 */
export const buildSearchFilter = (
  searchTerm: string | undefined,
  columns: PgColumn[],
): SQL | undefined => {
  if (!searchTerm?.trim())
    return undefined

  const searchParts = searchTerm.trim().split(' ').filter(Boolean)
  if (searchParts.length === 0)
    return undefined

  return and(
    ...searchParts.map(part =>
      or(...columns.map(col => ilike(col, `%${part}%`))),
    ),
  )
}
