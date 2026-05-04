import { beforeEach, describe, expect, it } from 'vitest'

import * as schema from '../server/database/schema'
import {
  buildTsQuery,
  createKbEntryService,
  createKbTagService,
} from '../server/features/kb/service'
import { getDatabase } from '../server/infrastructure/database/client'
import { createItemService } from '../server/infrastructure/database/item-service'

import { createOrganisationData } from './factories'

const db = getDatabase('app')

const organisationsItemService = createItemService({ db, table: schema.organisations, tableName: 'organisations' })
const kbEntriesItemService = createItemService({ db, table: schema.kbEntries, tableName: 'kbEntries' })
const kbTagsItemService = createItemService({ db, table: schema.kbTags, tableName: 'kbTags' })

const kbTagService = createKbTagService({ db, kbTagsItemService })
const kbEntryService = createKbEntryService({
  db,
  kbEntriesItemService,
  kbTagService,
})

const setupOrg = async () => {
  return organisationsItemService.create(createOrganisationData())
}

describe('buildTsQuery', () => {
  it('appends prefix-match `:*` to each token and joins with `&`', () => {
    expect(buildTsQuery('foo bar')).toBe('foo:* & bar:*')
  })

  it('returns null on empty / whitespace-only input', () => {
    expect(buildTsQuery('')).toBeNull()
    expect(buildTsQuery('   ')).toBeNull()
  })

  it('strips tsquery operator characters and yields null when nothing remains', () => {
    expect(buildTsQuery('!()|&')).toBeNull()
    expect(buildTsQuery('<>:*\'"\\')).toBeNull()
  })

  it('treats stripped operators as token boundaries', () => {
    // `foo & bar` → `&` becomes a space → tokens ['foo','bar']
    expect(buildTsQuery('foo & bar')).toBe('foo:* & bar:*')
  })

  it('preserves single-character tokens', () => {
    expect(buildTsQuery('a b')).toBe('a:* & b:*')
  })
})

describe('kbEntryService — full-text search (T-1.5)', () => {
  let orgId: string

  beforeEach(async () => {
    orgId = (await setupOrg()).id
  })

  it('ranks title matches above body matches', async () => {
    // Body-match entry created FIRST so the created_at tiebreaker wouldn't
    // bring the title-match entry to the top by accident — rank must do it.
    const bodyMatch = await kbEntryService.create({
      organisationId: orgId,
      title: 'Unrelated Heading',
      body: 'Mentions widget in passing.',
    })
    const titleMatch = await kbEntryService.create({
      organisationId: orgId,
      title: 'Widget Guide',
      body: 'A short note about something else entirely.',
    })

    const hits = await kbEntryService.list({ organisationId: orgId, search: 'widget' })

    expect(hits.map(h => h.id)).toEqual([titleMatch.id, bodyMatch.id])
  })

  it('supports prefix matching (search `foob` finds `Foobar`)', async () => {
    const entry = await kbEntryService.create({
      organisationId: orgId,
      title: 'Foobar Recipes',
      body: 'Cooking tips.',
    })
    await kbEntryService.create({
      organisationId: orgId,
      title: 'Quux',
      body: 'no match here',
    })

    const hits = await kbEntryService.list({ organisationId: orgId, search: 'foob' })
    expect(hits.map(h => h.id)).toEqual([entry.id])
  })

  it('multi-word search ANDs the tokens (each with prefix match)', async () => {
    const both = await kbEntryService.create({
      organisationId: orgId,
      title: 'Foo and Bar Together',
      body: 'Body content.',
    })
    await kbEntryService.create({
      organisationId: orgId,
      title: 'Only Foo',
      body: 'just foo here',
    })
    await kbEntryService.create({
      organisationId: orgId,
      title: 'Only Bar',
      body: 'just bar here',
    })

    const hits = await kbEntryService.list({ organisationId: orgId, search: 'foo bar' })
    expect(hits.map(h => h.id)).toEqual([both.id])
  })

  it('isolates results by workspace', async () => {
    const otherOrgId = (await setupOrg()).id

    const inA = await kbEntryService.create({
      organisationId: orgId,
      title: 'Workspace A widget',
    })
    await kbEntryService.create({
      organisationId: otherOrgId,
      title: 'Workspace B widget',
    })

    const hits = await kbEntryService.list({ organisationId: orgId, search: 'widget' })
    expect(hits.map(h => h.id)).toEqual([inA.id])
  })

  it('excludes archived and soft-deleted entries by default', async () => {
    const live = await kbEntryService.create({ organisationId: orgId, title: 'Live alpha' })
    const archived = await kbEntryService.create({ organisationId: orgId, title: 'Archived alpha' })
    await kbEntryService.setStatus(archived.id, 'archived')
    const deleted = await kbEntryService.create({ organisationId: orgId, title: 'Deleted alpha' })
    await kbEntryService.softDelete(deleted.id)

    const hits = await kbEntryService.list({ organisationId: orgId, search: 'alpha' })
    expect(hits.map(h => h.id)).toEqual([live.id])
  })

  it('combines status filter with search', async () => {
    const draft = await kbEntryService.create({
      organisationId: orgId,
      title: 'Beta draft',
    })
    const verified = await kbEntryService.create({
      organisationId: orgId,
      title: 'Beta verified',
    })
    await kbEntryService.setStatus(verified.id, 'verified')

    const onlyVerified = await kbEntryService.list({
      organisationId: orgId,
      search: 'beta',
      status: 'verified',
    })
    expect(onlyVerified.map(h => h.id)).toEqual([verified.id])

    const onlyDraft = await kbEntryService.list({
      organisationId: orgId,
      search: 'beta',
      status: 'draft',
    })
    expect(onlyDraft.map(h => h.id)).toEqual([draft.id])
  })

  it('empty / whitespace search returns the regular filtered list (no FTS)', async () => {
    const a = await kbEntryService.create({ organisationId: orgId, title: 'Alpha' })
    const b = await kbEntryService.create({ organisationId: orgId, title: 'Beta' })

    const empty = await kbEntryService.list({ organisationId: orgId, search: '' })
    const whitespace = await kbEntryService.list({ organisationId: orgId, search: '   ' })
    const noSearch = await kbEntryService.list({ organisationId: orgId })

    expect(empty.map(e => e.id).sort()).toEqual([a.id, b.id].sort())
    expect(whitespace.map(e => e.id).sort()).toEqual([a.id, b.id].sort())
    expect(noSearch.map(e => e.id).sort()).toEqual([a.id, b.id].sort())
  })

  it('sanitises tsquery operators in user input without crashing', async () => {
    const both = await kbEntryService.create({
      organisationId: orgId,
      title: 'Foo and Bar',
    })
    await kbEntryService.create({ organisationId: orgId, title: 'Only Foo' })

    // `&` becomes whitespace → tokens [foo, bar] → AND-of-tokens
    const hits = await kbEntryService.list({ organisationId: orgId, search: 'foo & bar' })
    expect(hits.map(h => h.id)).toEqual([both.id])
  })

  it('returns zero results when sanitisation strips everything', async () => {
    await kbEntryService.create({ organisationId: orgId, title: 'Anything' })
    await kbEntryService.create({ organisationId: orgId, title: 'Else' })

    const hits = await kbEntryService.list({ organisationId: orgId, search: '!()' })
    expect(hits).toEqual([])
  })

  it('honours limit and offset on the search path', async () => {
    // Three matches; created_at tiebreaker on equal rank means newest first.
    await kbEntryService.create({ organisationId: orgId, title: 'gizmo one' })
    await kbEntryService.create({ organisationId: orgId, title: 'gizmo two' })
    await kbEntryService.create({ organisationId: orgId, title: 'gizmo three' })

    const firstPage = await kbEntryService.list({
      organisationId: orgId,
      search: 'gizmo',
      limit: 2,
    })
    expect(firstPage).toHaveLength(2)

    const secondPage = await kbEntryService.list({
      organisationId: orgId,
      search: 'gizmo',
      limit: 2,
      offset: 2,
    })
    expect(secondPage).toHaveLength(1)
  })
})
