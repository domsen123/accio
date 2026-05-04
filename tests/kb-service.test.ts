import { beforeEach, describe, expect, it } from 'vitest'

import * as schema from '../server/database/schema'
import {
  createKbCategoryService,
  createKbEntryService,
  createKbTagService,
} from '../server/features/kb/service'
import { getDatabase } from '../server/infrastructure/database/client'
import { createItemService } from '../server/infrastructure/database/item-service'

import { createOrganisationData } from './factories'

const db = getDatabase('app')

const organisationsItemService = createItemService({ db, table: schema.organisations, tableName: 'organisations' })
const kbEntriesItemService = createItemService({ db, table: schema.kbEntries, tableName: 'kbEntries' })
const kbCategoriesItemService = createItemService({ db, table: schema.kbCategories, tableName: 'kbCategories' })
const kbTagsItemService = createItemService({ db, table: schema.kbTags, tableName: 'kbTags' })

const kbCategoryService = createKbCategoryService({ kbCategoriesItemService })
const kbTagService = createKbTagService({ db, kbTagsItemService })
const kbEntryService = createKbEntryService({
  db,
  kbEntriesItemService,
  kbTagService,
})

const setupOrg = async () => {
  return organisationsItemService.create(createOrganisationData())
}

describe('kbCategoryService', () => {
  let orgId: string

  beforeEach(async () => {
    orgId = (await setupOrg()).id
  })

  it('creates a category and lists it for the workspace', async () => {
    await kbCategoryService.create({
      organisationId: orgId,
      name: 'Recipes',
      slug: 'recipes',
    })

    const list = await kbCategoryService.list({ organisationId: orgId })
    expect(list).toHaveLength(1)
    expect(list[0].name).toBe('Recipes')
    expect(list[0].slug).toBe('recipes')
  })

  it('default-list excludes soft-deleted categories', async () => {
    const a = await kbCategoryService.create({ organisationId: orgId, name: 'Live', slug: 'live' })
    const b = await kbCategoryService.create({ organisationId: orgId, name: 'Trash', slug: 'trash' })

    await kbCategoryService.softDelete(b.id)

    const live = await kbCategoryService.list({ organisationId: orgId })
    expect(live.map(c => c.id)).toEqual([a.id])

    const all = await kbCategoryService.list({ organisationId: orgId, includeDeleted: true })
    expect(all).toHaveLength(2)
  })

  it('supports parent/child trees', async () => {
    const parent = await kbCategoryService.create({ organisationId: orgId, name: 'Food', slug: 'food' })
    const child = await kbCategoryService.create({
      organisationId: orgId,
      name: 'Italian',
      slug: 'italian',
      parentId: parent.id,
    })

    expect(child.parentId).toBe(parent.id)

    const restored = await kbCategoryService.restore(parent.id) // no-op restore for coverage
    expect(restored.deletedAt).toBeNull()
  })

  it('rejects duplicate slug per workspace', async () => {
    await kbCategoryService.create({ organisationId: orgId, name: 'Notes', slug: 'notes' })
    await expect(
      kbCategoryService.create({ organisationId: orgId, name: 'Notes 2', slug: 'notes' }),
    ).rejects.toThrow()
  })
})

describe('kbTagService', () => {
  let orgId: string

  beforeEach(async () => {
    orgId = (await setupOrg()).id
  })

  it('findOrCreate inserts on miss', async () => {
    const tag = await kbTagService.findOrCreate({ organisationId: orgId, name: 'Recipe' })
    expect(tag.id).toBeDefined()
    expect(tag.name).toBe('Recipe')
  })

  it('findOrCreate returns the same row for case-different names', async () => {
    const a = await kbTagService.findOrCreate({ organisationId: orgId, name: 'Foo' })
    const b = await kbTagService.findOrCreate({ organisationId: orgId, name: 'foo' })
    const c = await kbTagService.findOrCreate({ organisationId: orgId, name: 'FOO' })

    expect(b.id).toBe(a.id)
    expect(c.id).toBe(a.id)

    const all = await kbTagService.list({ organisationId: orgId })
    expect(all).toHaveLength(1)
  })

  it('allows the same tag name in two different workspaces', async () => {
    const otherOrg = (await organisationsItemService.create(createOrganisationData())).id

    const a = await kbTagService.findOrCreate({ organisationId: orgId, name: 'shared' })
    const b = await kbTagService.findOrCreate({ organisationId: otherOrg, name: 'shared' })

    expect(a.id).not.toBe(b.id)
    expect(a.organisationId).toBe(orgId)
    expect(b.organisationId).toBe(otherOrg)
  })
})

describe('kbEntryService', () => {
  let orgId: string

  beforeEach(async () => {
    orgId = (await setupOrg()).id
  })

  it('creates an entry with a derived slug and human/manual defaults', async () => {
    const entry = await kbEntryService.create({
      organisationId: orgId,
      title: 'My First Note',
      body: '# Hello',
    })

    expect(entry.slug).toBe('my-first-note')
    expect(entry.status).toBe('draft')
    expect(entry.authorType).toBe('human')
    expect(entry.sourceType).toBe('manual')
    expect(entry.bodyMd).toBe('# Hello')
  })

  it('creates an entry with tag names, materialising tag rows + junction', async () => {
    const entry = await kbEntryService.create({
      organisationId: orgId,
      title: 'Tagged Entry',
      tagNames: ['Foo', 'bar'],
    })

    const found = await kbEntryService.findBySlug({ organisationId: orgId, slug: entry.slug })
    expect(found).not.toBeNull()
    expect(found!.tags.map(t => t.name).sort()).toEqual(['Foo', 'bar'])

    const tagRows = await kbTagService.list({ organisationId: orgId })
    expect(tagRows).toHaveLength(2)
  })

  it('findBySlug returns category and tags populated', async () => {
    const category = await kbCategoryService.create({
      organisationId: orgId,
      name: 'Cookery',
      slug: 'cookery',
    })
    const entry = await kbEntryService.create({
      organisationId: orgId,
      title: 'Pasta Carbonara',
      categoryId: category.id,
      tagNames: ['italian'],
    })

    const found = await kbEntryService.findBySlug({ organisationId: orgId, slug: entry.slug })
    expect(found?.id).toBe(entry.id)
    expect(found?.category?.id).toBe(category.id)
    expect(found?.tags.map(t => t.name)).toEqual(['italian'])
  })

  it('list filters by status and excludes archived/deleted by default', async () => {
    const draft = await kbEntryService.create({ organisationId: orgId, title: 'Drafty' })
    const verified = await kbEntryService.create({ organisationId: orgId, title: 'Verified Note' })
    await kbEntryService.setStatus(verified.id, 'verified')
    const archived = await kbEntryService.create({ organisationId: orgId, title: 'Archived Note' })
    await kbEntryService.setStatus(archived.id, 'archived')
    const deleted = await kbEntryService.create({ organisationId: orgId, title: 'Deleted Note' })
    await kbEntryService.softDelete(deleted.id)

    const visible = await kbEntryService.list({ organisationId: orgId })
    const visibleIds = visible.map(e => e.id)
    expect(visibleIds).toContain(draft.id)
    expect(visibleIds).toContain(verified.id)
    expect(visibleIds).not.toContain(archived.id)
    expect(visibleIds).not.toContain(deleted.id)

    const onlyDrafts = await kbEntryService.list({ organisationId: orgId, status: 'draft' })
    expect(onlyDrafts.map(e => e.id)).toEqual([draft.id])

    const includingArchived = await kbEntryService.list({ organisationId: orgId, includeArchived: true })
    expect(includingArchived.map(e => e.id)).toContain(archived.id)
  })

  it('list with search matches title via ILIKE', async () => {
    await kbEntryService.create({ organisationId: orgId, title: 'Foobar Recipes', body: '' })
    await kbEntryService.create({ organisationId: orgId, title: 'Other Topic', body: 'mentions foobar inside' })
    await kbEntryService.create({ organisationId: orgId, title: 'Unrelated', body: 'nothing here' })

    const hits = await kbEntryService.list({ organisationId: orgId, search: 'foo' })
    expect(hits).toHaveLength(2)
  })

  it('update with tagNames replaces the tag set', async () => {
    const entry = await kbEntryService.create({
      organisationId: orgId,
      title: 'Has Tags',
      tagNames: ['alpha', 'beta'],
    })

    await kbEntryService.update(entry.id, { tagNames: ['gamma'] })

    const found = await kbEntryService.findBySlug({ organisationId: orgId, slug: entry.slug })
    expect(found?.tags.map(t => t.name)).toEqual(['gamma'])
  })

  it('update edits title/body without rotating slug', async () => {
    const entry = await kbEntryService.create({
      organisationId: orgId,
      title: 'Original Title',
      body: 'old',
    })

    const updated = await kbEntryService.update(entry.id, {
      title: 'Brand New Title',
      body: 'fresh',
    })

    expect(updated.title).toBe('Brand New Title')
    expect(updated.bodyMd).toBe('fresh')
    // Slug stability: REQ-KB-1 says slug is stable across edits unless explicitly regenerated.
    expect(updated.slug).toBe('original-title')
  })

  it('setStatus / softDelete / restore round-trip correctly', async () => {
    const entry = await kbEntryService.create({ organisationId: orgId, title: 'Lifecycle' })

    const verified = await kbEntryService.setStatus(entry.id, 'verified')
    expect(verified.status).toBe('verified')

    const deleted = await kbEntryService.softDelete(entry.id)
    expect(deleted.deletedAt).toBeInstanceOf(Date)

    // default-scoped findBySlug excludes deleted
    expect(await kbEntryService.findBySlug({ organisationId: orgId, slug: entry.slug })).toBeNull()

    // includeDeleted finds it
    const includingDeleted = await kbEntryService.findBySlug({
      organisationId: orgId,
      slug: entry.slug,
      includeDeleted: true,
    })
    expect(includingDeleted?.id).toBe(entry.id)

    const restored = await kbEntryService.restore(entry.id)
    expect(restored.deletedAt).toBeNull()
  })

  it('auto-suffixes duplicate-title creates in the same workspace', async () => {
    const a = await kbEntryService.create({ organisationId: orgId, title: 'Same Title' })
    const b = await kbEntryService.create({ organisationId: orgId, title: 'Same Title' })
    const c = await kbEntryService.create({ organisationId: orgId, title: 'Same Title' })

    expect(a.slug).toBe('same-title')
    expect(b.slug).toBe('same-title-2')
    expect(c.slug).toBe('same-title-3')
  })

  it('allows two workspaces to independently use the same slug', async () => {
    const otherOrg = (await organisationsItemService.create(createOrganisationData())).id

    const a = await kbEntryService.create({ organisationId: orgId, title: 'Shared Title' })
    const b = await kbEntryService.create({ organisationId: otherOrg, title: 'Shared Title' })

    expect(a.slug).toBe('shared-title')
    expect(b.slug).toBe('shared-title')
    expect(a.organisationId).not.toBe(b.organisationId)
  })
})
