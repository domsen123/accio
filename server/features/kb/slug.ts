// Slug generation for KB entries.
//
// Two responsibilities:
//   1. `slugify(title)` — pure transformation from a title string to a URL-safe
//      slug, with German-umlaut transliteration and Unicode NFKD diacritic
//      stripping. No DB access; no surrounding context.
//   2. `resolveUniqueSlug({ db, organisationId, base, excludeEntryId? })` —
//      workspace-scoped collision suffixing. Given a base slug, returns either
//      `base` (if free) or `base-N` for the smallest unused integer N >= 2.
//
// Slug rules (REQ-KB-1 prescribes uniqueness per workspace and stability across
// edits; the cosmetic rules below are local conventions):
//   - German umlauts transliterate: ä→ae, ö→oe, ü→ue, ß→ss (case-preserving
//     for Ä/Ö/Ü → Ae/Oe/Ue, then lowercased at the end).
//   - Other diacritics: NFKD normalize, strip combining marks (e.g. é→e).
//   - Non-alphanumeric runs collapse to a single `-`. Leading/trailing `-`
//     trimmed. Lowercase.
//   - Empty input or input that slugifies to empty → `'untitled'`.
//
// Suffix scheme: `slug`, `slug-2`, `slug-3`, ... — never `slug-1`.
// Soft-deleted rows (`deleted_at IS NOT NULL`) still count as taken so a
// zombie restore cannot stomp a live entry's slug.

import type { DatabaseClient } from '../../infrastructure/database/client'
import { and, eq, ne, or, sql } from 'drizzle-orm'
import * as schema from '../../database/schema'

const UMLAUT_MAP: Record<string, string> = {
  ä: 'ae',
  ö: 'oe',
  ü: 'ue',
  Ä: 'Ae',
  Ö: 'Oe',
  Ü: 'Ue',
  ß: 'ss',
}

const transliterateUmlauts = (input: string): string =>
  input.replace(/[äöüß]/gi, ch => UMLAUT_MAP[ch] ?? ch)

export const slugify = (title: string): string => {
  if (!title)
    return 'untitled'

  // 1) German umlauts first — must run before NFKD or `ü` decomposes to `u + ¨`
  //    and we'd lose the `ue` transliteration.
  // 2) NFKD normalize the rest, strip combining marks (Unicode category Mn).
  // 3) Lowercase, collapse non-alphanum runs to `-`, trim, dedupe `-`.
  const slug = transliterateUmlauts(title)
    .normalize('NFKD')
    .replace(/\p{M}/gu, '') // strip combining marks (e.g. é → e + ́ → e)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

  return slug || 'untitled'
}

/**
 * Find the smallest free workspace-scoped slug given a base.
 *
 * Performs a single query for all rows whose slug is `base` or starts with
 * `base-`, then computes the next free integer in JS. Soft-deleted rows count
 * as taken. If `excludeEntryId` is supplied, that row's slug is ignored
 * (useful for self-stable update paths).
 *
 * Race note: two simultaneous creates picking the same suffix will hit the
 * `(organisation_id, slug)` unique constraint. We deliberately don't add
 * transactional locking — single-user dev makes the race vanishingly rare and
 * the existing service layer doesn't otherwise lock.
 */
export const resolveUniqueSlug = async (params: {
  db: DatabaseClient
  organisationId: string
  base: string
  excludeEntryId?: string
}): Promise<string> => {
  const { db, organisationId, base, excludeEntryId } = params

  const conditions = [
    eq(schema.kbEntries.organisationId, organisationId),
    or(
      eq(schema.kbEntries.slug, base),
      sql`${schema.kbEntries.slug} LIKE ${`${base}-%`}`,
    ),
  ]
  if (excludeEntryId)
    conditions.push(ne(schema.kbEntries.id, excludeEntryId))

  const rows = await db
    .select({ slug: schema.kbEntries.slug })
    .from(schema.kbEntries)
    .where(and(...conditions))

  const taken = new Set(rows.map(r => r.slug))
  if (!taken.has(base))
    return base

  // Find the smallest N >= 2 such that `${base}-${N}` is unused.
  // Iterate over only the values we observed; `taken.size` is a strict upper
  // bound on N because each existing collision contributes at most one slug.
  for (let n = 2; n <= taken.size + 1; n++) {
    const candidate = `${base}-${n}`
    if (!taken.has(candidate))
      return candidate
  }
  // Unreachable: the loop always exits via the early return above.
  return `${base}-${taken.size + 1}`
}
