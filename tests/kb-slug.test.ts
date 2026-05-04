import { beforeEach, describe, expect, it } from 'vitest'

import * as schema from '../server/database/schema'
import { resolveUniqueSlug, slugify } from '../server/features/kb/slug'
import { getDatabase } from '../server/infrastructure/database/client'
import { createItemService } from '../server/infrastructure/database/item-service'

import { createOrganisationData } from './factories'

const db = getDatabase('app')

const organisationsItemService = createItemService({ db, table: schema.organisations, tableName: 'organisations' })
const kbEntriesItemService = createItemService({ db, table: schema.kbEntries, tableName: 'kbEntries' })

const setupOrg = async () => {
  return organisationsItemService.create(createOrganisationData())
}

const insertEntry = async (organisationId: string, slug: string, overrides: Record<string, unknown> = {}) => {
  return kbEntriesItemService.create({
    organisationId,
    slug,
    title: slug,
    bodyMd: '',
    status: 'draft',
    authorType: 'human',
    authorName: '',
    sourceType: 'manual',
    ...overrides,
  })
}

describe('slugify', () => {
  it('returns "untitled" for empty input', () => {
    expect(slugify('')).toBe('untitled')
  })

  it('returns "untitled" when nothing slug-worthy remains', () => {
    expect(slugify('!!! ??? ---')).toBe('untitled')
  })

  it('lowercases ASCII and replaces spaces with hyphens', () => {
    expect(slugify('Hello World')).toBe('hello-world')
  })

  it('collapses punctuation runs to a single hyphen', () => {
    expect(slugify('Foo, bar! Baz?')).toBe('foo-bar-baz')
  })

  it('transliterates lowercase German umlauts', () => {
    expect(slugify('Über Größe')).toBe('ueber-groesse')
    expect(slugify('Heiße Würste')).toBe('heisse-wuerste')
  })

  it('transliterates uppercase German umlauts at word starts', () => {
    expect(slugify('Älteste Übersicht')).toBe('aelteste-uebersicht')
  })

  it('strips non-German diacritics via NFKD', () => {
    expect(slugify('Café')).toBe('cafe')
    expect(slugify('naïve')).toBe('naive')
  })

  it('trims leading and trailing punctuation', () => {
    expect(slugify('  --foo--  ')).toBe('foo')
  })

  it('preserves digits', () => {
    expect(slugify('Topic 42 — Year 2026')).toBe('topic-42-year-2026')
  })

  it('collapses repeated separators', () => {
    expect(slugify('a---b')).toBe('a-b')
  })
})

describe('resolveUniqueSlug', () => {
  let orgId: string

  beforeEach(async () => {
    orgId = (await setupOrg()).id
  })

  it('returns the base when no row exists', async () => {
    const result = await resolveUniqueSlug({ db, organisationId: orgId, base: 'fresh' })
    expect(result).toBe('fresh')
  })

  it('returns base-2 when base is taken', async () => {
    await insertEntry(orgId, 'taken')
    const result = await resolveUniqueSlug({ db, organisationId: orgId, base: 'taken' })
    expect(result).toBe('taken-2')
  })

  it('returns base-3 when base and base-2 are taken', async () => {
    await insertEntry(orgId, 'note')
    await insertEntry(orgId, 'note-2')
    const result = await resolveUniqueSlug({ db, organisationId: orgId, base: 'note' })
    expect(result).toBe('note-3')
  })

  it('returns base-4 when base, base-2, base-3 are taken', async () => {
    await insertEntry(orgId, 'note')
    await insertEntry(orgId, 'note-2')
    await insertEntry(orgId, 'note-3')
    const result = await resolveUniqueSlug({ db, organisationId: orgId, base: 'note' })
    expect(result).toBe('note-4')
  })

  it('fills holes: returns base-2 when base and base-3 exist (no base-2)', async () => {
    await insertEntry(orgId, 'gappy')
    await insertEntry(orgId, 'gappy-3')
    const result = await resolveUniqueSlug({ db, organisationId: orgId, base: 'gappy' })
    expect(result).toBe('gappy-2')
  })

  it('is workspace-scoped: same base in another org does not conflict', async () => {
    await insertEntry(orgId, 'shared')
    const otherOrg = (await setupOrg()).id
    const result = await resolveUniqueSlug({ db, organisationId: otherOrg, base: 'shared' })
    expect(result).toBe('shared')
  })

  it('counts soft-deleted rows as taken', async () => {
    const row = await insertEntry(orgId, 'zombie')
    await kbEntriesItemService.update(row.id, { deletedAt: new Date() })
    const result = await resolveUniqueSlug({ db, organisationId: orgId, base: 'zombie' })
    expect(result).toBe('zombie-2')
  })

  it('excludeEntryId lets a row keep its own slug', async () => {
    const row = await insertEntry(orgId, 'self')
    const result = await resolveUniqueSlug({
      db,
      organisationId: orgId,
      base: 'self',
      excludeEntryId: row.id,
    })
    expect(result).toBe('self')
  })
})
