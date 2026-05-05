import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'

import * as schema from '../server/database/schema'
import {
  createKbCategoryService,
  createKbEntryService,
  createKbTagService,
} from '../server/features/kb/service'
import {
  KB_ENTRY_STATUSES,
  KbCannotPurgeActiveError,
  KbInvalidStatusTransitionError,
} from '../server/features/kb/types'
import { createTodoService } from '../server/features/todo/service'
import { getDatabase } from '../server/infrastructure/database/client'
import { createItemService } from '../server/infrastructure/database/item-service'

import { createOrganisationData } from './factories'

const db = getDatabase('app')

const organisationsItemService = createItemService({ db, table: schema.organisations, tableName: 'organisations' })
const kbEntriesItemService = createItemService({ db, table: schema.kbEntries, tableName: 'kbEntries' })
const kbCategoriesItemService = createItemService({ db, table: schema.kbCategories, tableName: 'kbCategories' })
const kbTagsItemService = createItemService({ db, table: schema.kbTags, tableName: 'kbTags' })
const todosItemService = createItemService({ db, table: schema.todos, tableName: 'todos' })

const kbCategoryService = createKbCategoryService({ kbCategoriesItemService })
const kbTagService = createKbTagService({ db, kbTagsItemService })
const kbEntryService = createKbEntryService({
  db,
  kbEntriesItemService,
  kbTagService,
})
const todoService = createTodoService({
  db,
  todosItemService,
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

  it('list with search matches title and body via FTS (T-1.5)', async () => {
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

describe('kbEntryService — list with includeDescendantCategories (T-1.11)', () => {
  let orgId: string

  beforeEach(async () => {
    orgId = (await setupOrg()).id
  })

  it('opt-in only: a single-category filter still matches one category by default', async () => {
    const food = await kbCategoryService.create({ organisationId: orgId, name: 'Food', slug: 'food' })
    const italian = await kbCategoryService.create({
      organisationId: orgId,
      name: 'Italian',
      slug: 'italian',
      parentId: food.id,
    })

    await kbEntryService.create({ organisationId: orgId, title: 'In food', categoryId: food.id })
    await kbEntryService.create({ organisationId: orgId, title: 'In italian', categoryId: italian.id })

    // Without `includeDescendantCategories`, the filter is the literal categoryId.
    const onlyFood = await kbEntryService.list({ organisationId: orgId, categoryId: food.id })
    expect(onlyFood.map(e => e.title).sort()).toEqual(['In food'])
  })

  it('expands to immediate children when includeDescendantCategories is true', async () => {
    const food = await kbCategoryService.create({ organisationId: orgId, name: 'Food', slug: 'food' })
    const italian = await kbCategoryService.create({
      organisationId: orgId,
      name: 'Italian',
      slug: 'italian',
      parentId: food.id,
    })
    const french = await kbCategoryService.create({
      organisationId: orgId,
      name: 'French',
      slug: 'french',
      parentId: food.id,
    })
    const unrelated = await kbCategoryService.create({
      organisationId: orgId,
      name: 'Travel',
      slug: 'travel',
    })

    await kbEntryService.create({ organisationId: orgId, title: 'Pasta', categoryId: italian.id })
    await kbEntryService.create({ organisationId: orgId, title: 'Croissant', categoryId: french.id })
    await kbEntryService.create({ organisationId: orgId, title: 'Trip', categoryId: unrelated.id })

    const subtree = await kbEntryService.list({
      organisationId: orgId,
      categoryId: food.id,
      includeDescendantCategories: true,
    })
    expect(subtree.map(e => e.title).sort()).toEqual(['Croissant', 'Pasta'])
  })

  it('walks multi-level descendants and includes the anchor category itself', async () => {
    const food = await kbCategoryService.create({ organisationId: orgId, name: 'Food', slug: 'food' })
    const italian = await kbCategoryService.create({
      organisationId: orgId,
      name: 'Italian',
      slug: 'italian',
      parentId: food.id,
    })
    const pasta = await kbCategoryService.create({
      organisationId: orgId,
      name: 'Pasta',
      slug: 'pasta',
      parentId: italian.id,
    })

    // Entries spread across all three depths.
    await kbEntryService.create({ organisationId: orgId, title: 'Top of food', categoryId: food.id })
    await kbEntryService.create({ organisationId: orgId, title: 'Italian classics', categoryId: italian.id })
    await kbEntryService.create({ organisationId: orgId, title: 'Carbonara', categoryId: pasta.id })

    const subtree = await kbEntryService.list({
      organisationId: orgId,
      categoryId: food.id,
      includeDescendantCategories: true,
    })
    expect(subtree.map(e => e.title).sort()).toEqual(['Carbonara', 'Italian classics', 'Top of food'])

    // Anchor at a mid-level category — must include just that subtree.
    const onlyItalianSubtree = await kbEntryService.list({
      organisationId: orgId,
      categoryId: italian.id,
      includeDescendantCategories: true,
    })
    expect(onlyItalianSubtree.map(e => e.title).sort()).toEqual(['Carbonara', 'Italian classics'])
  })
})

describe('kbEntryService — wikilinks and backlinks', () => {
  let orgId: string

  const linksOf = async (entryId: string) => {
    return db
      .select()
      .from(schema.kbEntryLinks)
      .where(eq(schema.kbEntryLinks.fromEntryId, entryId))
  }

  beforeEach(async () => {
    orgId = (await setupOrg()).id
  })

  it('records an unresolved link when target slug does not yet exist', async () => {
    const source = await kbEntryService.create({
      organisationId: orgId,
      title: 'Source',
      body: 'See [[other]] for context.',
    })

    const links = await linksOf(source.id)
    expect(links).toHaveLength(1)
    expect(links[0]!.toSlug).toBe('other')
    expect(links[0]!.toEntryId).toBeNull()
    expect(links[0]!.resolved).toBe(false)
    expect(links[0]!.organisationId).toBe(orgId)
  })

  it('back-fills a previously-unresolved link when the target is created', async () => {
    const source = await kbEntryService.create({
      organisationId: orgId,
      title: 'Source',
      body: 'See [[other]].',
    })
    const target = await kbEntryService.create({
      organisationId: orgId,
      title: 'Other',
    })
    expect(target.slug).toBe('other')

    const links = await linksOf(source.id)
    expect(links).toHaveLength(1)
    expect(links[0]!.toEntryId).toBe(target.id)
    expect(links[0]!.resolved).toBe(true)
  })

  it('resolves links to existing entries on create', async () => {
    const target = await kbEntryService.create({ organisationId: orgId, title: 'Existing' })
    expect(target.slug).toBe('existing')

    const source = await kbEntryService.create({
      organisationId: orgId,
      title: 'Source',
      body: 'Refers to [[existing]].',
    })

    const links = await linksOf(source.id)
    expect(links).toHaveLength(1)
    expect(links[0]!.toEntryId).toBe(target.id)
    expect(links[0]!.resolved).toBe(true)
  })

  it('rebuilds links on update: removing a wikilink deletes the row', async () => {
    const source = await kbEntryService.create({
      organisationId: orgId,
      title: 'Source',
      body: 'Has [[one]] and [[two]].',
    })
    expect(await linksOf(source.id)).toHaveLength(2)

    await kbEntryService.update(source.id, { body: 'Only [[one]] now.' })

    const links = await linksOf(source.id)
    expect(links.map(l => l.toSlug)).toEqual(['one'])
  })

  it('rebuilds links on update: adding a wikilink inserts the row', async () => {
    const source = await kbEntryService.create({
      organisationId: orgId,
      title: 'Source',
      body: 'No links.',
    })
    expect(await linksOf(source.id)).toHaveLength(0)

    await kbEntryService.update(source.id, { body: 'Now there is [[fresh]].' })

    const links = await linksOf(source.id)
    expect(links.map(l => l.toSlug)).toEqual(['fresh'])
  })

  it('deduplicates: same target appearing twice in the body produces one link row', async () => {
    const source = await kbEntryService.create({
      organisationId: orgId,
      title: 'Source',
      body: 'Mentions [[same]] and again [[same]].',
    })
    const links = await linksOf(source.id)
    expect(links).toHaveLength(1)
    expect(links[0]!.toSlug).toBe('same')
  })

  it('does not resolve to an entry in another workspace', async () => {
    const otherOrg = (await organisationsItemService.create(createOrganisationData())).id
    // Create a same-slug entry in workspace 2.
    const otherEntry = await kbEntryService.create({ organisationId: otherOrg, title: 'Bar' })
    expect(otherEntry.slug).toBe('bar')

    const source = await kbEntryService.create({
      organisationId: orgId,
      title: 'Source A',
      body: 'I want [[bar]].',
    })

    const links = await linksOf(source.id)
    expect(links).toHaveLength(1)
    expect(links[0]!.toEntryId).toBeNull()
    expect(links[0]!.organisationId).toBe(orgId)
  })

  it('getBacklinks returns entries that link to the target, sorted by title', async () => {
    const target = await kbEntryService.create({ organisationId: orgId, title: 'Target' })
    const a = await kbEntryService.create({
      organisationId: orgId,
      title: 'Alpha',
      body: 'Talks about [[target]].',
    })
    const b = await kbEntryService.create({
      organisationId: orgId,
      title: 'Beta',
      body: 'Also references [[target]].',
    })
    // Unrelated entry (no link).
    await kbEntryService.create({
      organisationId: orgId,
      title: 'Charlie',
      body: 'Nothing here.',
    })

    const backlinks = await kbEntryService.getBacklinks({
      organisationId: orgId,
      entryId: target.id,
    })
    expect(backlinks.map(bl => bl.id)).toEqual([a.id, b.id])
    expect(backlinks.map(bl => bl.title)).toEqual(['Alpha', 'Beta'])
  })

  it('getBacklinks excludes soft-deleted source entries by default', async () => {
    const target = await kbEntryService.create({ organisationId: orgId, title: 'Target' })
    const a = await kbEntryService.create({
      organisationId: orgId,
      title: 'Alpha',
      body: '[[target]]',
    })
    const b = await kbEntryService.create({
      organisationId: orgId,
      title: 'Beta',
      body: '[[target]]',
    })
    await kbEntryService.softDelete(a.id)

    const visible = await kbEntryService.getBacklinks({
      organisationId: orgId,
      entryId: target.id,
    })
    expect(visible.map(bl => bl.id)).toEqual([b.id])

    const all = await kbEntryService.getBacklinks({
      organisationId: orgId,
      entryId: target.id,
      includeDeleted: true,
    })
    expect(all.map(bl => bl.id).sort()).toEqual([a.id, b.id].sort())
  })

  it('does not parse wikilinks inside fenced code blocks', async () => {
    const body = [
      'prose [[real]]',
      '```ts',
      'const fake = "[[skip]]"',
      '```',
    ].join('\n')

    const source = await kbEntryService.create({
      organisationId: orgId,
      title: 'CodeFences',
      body,
    })
    const links = await linksOf(source.id)
    expect(links.map(l => l.toSlug)).toEqual(['real'])
  })

  it('soft-delete and restore do not touch outgoing link rows', async () => {
    const target = await kbEntryService.create({ organisationId: orgId, title: 'Target' })
    const source = await kbEntryService.create({
      organisationId: orgId,
      title: 'Source',
      body: 'Refers to [[target]].',
    })
    const before = await linksOf(source.id)
    expect(before).toHaveLength(1)
    expect(before[0]!.toEntryId).toBe(target.id)

    await kbEntryService.softDelete(source.id)
    const afterDelete = await linksOf(source.id)
    expect(afterDelete).toHaveLength(1)

    await kbEntryService.restore(source.id)
    const afterRestore = await linksOf(source.id)
    expect(afterRestore).toHaveLength(1)
  })

  it('update without body does not touch existing link rows', async () => {
    const source = await kbEntryService.create({
      organisationId: orgId,
      title: 'Source',
      body: 'Has [[one]].',
    })
    const before = await linksOf(source.id)
    expect(before).toHaveLength(1)
    const beforeId = before[0]!.id

    await kbEntryService.update(source.id, { title: 'Different Title' })

    const after = await linksOf(source.id)
    expect(after).toHaveLength(1)
    expect(after[0]!.id).toBe(beforeId)
  })

  it('back-resolution is workspace-scoped', async () => {
    // Workspace 1 has an unresolved link to slug `bar`.
    const sourceA = await kbEntryService.create({
      organisationId: orgId,
      title: 'Source A',
      body: 'Wants [[bar]].',
    })
    expect((await linksOf(sourceA.id))[0]!.toEntryId).toBeNull()

    // Creating `bar` in workspace 2 must NOT resolve workspace 1's link.
    const otherOrg = (await organisationsItemService.create(createOrganisationData())).id
    await kbEntryService.create({ organisationId: otherOrg, title: 'Bar' })

    const stillUnresolved = await linksOf(sourceA.id)
    expect(stillUnresolved[0]!.toEntryId).toBeNull()
    expect(stillUnresolved[0]!.organisationId).toBe(orgId)
  })
})

describe('kbEntryService — status lifecycle (T-1.6)', () => {
  let orgId: string

  beforeEach(async () => {
    orgId = (await setupOrg()).id
  })

  // REQ-KB-7: the user can transition any entry between any of the four
  // statuses. We assert all 4×4 ordered pairs (including same-status no-ops)
  // succeed via setStatus, and that the final stored status matches.
  it.each(
    KB_ENTRY_STATUSES.flatMap(from => KB_ENTRY_STATUSES.map(to => [from, to] as const)),
  )('setStatus allows transition %s -> %s', async (from, to) => {
    const entry = await kbEntryService.create({
      organisationId: orgId,
      title: `transition-${from}-${to}`,
      status: from,
    })
    const updated = await kbEntryService.setStatus(entry.id, to)
    expect(updated.status).toBe(to)
  })

  it('setStatus throws KbInvalidStatusTransitionError for an unknown enum value', async () => {
    const entry = await kbEntryService.create({ organisationId: orgId, title: 'bad-status' })
    await expect(
      kbEntryService.setStatus(entry.id, 'bogus' as never),
    ).rejects.toBeInstanceOf(KbInvalidStatusTransitionError)
  })

  it('update({ status }) reuses the same transition validation', async () => {
    const entry = await kbEntryService.create({
      organisationId: orgId,
      title: 'update-status',
      status: 'inbox',
    })
    const updated = await kbEntryService.update(entry.id, { status: 'verified' })
    expect(updated.status).toBe('verified')

    await expect(
      kbEntryService.update(entry.id, { status: 'bogus' as never }),
    ).rejects.toBeInstanceOf(KbInvalidStatusTransitionError)
  })

  it('ai-authored create defaults to inbox (ADR-007)', async () => {
    const entry = await kbEntryService.create({
      organisationId: orgId,
      title: 'AI Note',
      authorType: 'ai',
      authorName: 'orchestrator',
    })
    expect(entry.status).toBe('inbox')
    expect(entry.authorType).toBe('ai')
  })

  it('ai-authored create honours an explicit status override', async () => {
    const entry = await kbEntryService.create({
      organisationId: orgId,
      title: 'AI Direct',
      authorType: 'ai',
      authorName: 'orchestrator',
      status: 'draft',
    })
    expect(entry.status).toBe('draft')
  })

  it('listInbox returns inbox-only entries sorted by created_at desc', async () => {
    const a = await kbEntryService.create({ organisationId: orgId, title: 'A', status: 'inbox' })
    // Force temporal ordering: bump A's createdAt back so B is newer.
    await db
      .update(schema.kbEntries)
      .set({ createdAt: new Date(Date.now() - 60_000) })
      .where(eq(schema.kbEntries.id, a.id))
    const b = await kbEntryService.create({ organisationId: orgId, title: 'B', status: 'inbox' })
    await kbEntryService.create({ organisationId: orgId, title: 'Drafty', status: 'draft' })

    const inbox = await kbEntryService.listInbox({ organisationId: orgId })
    expect(inbox.map(e => e.id)).toEqual([b.id, a.id])
    // Hydrated relations: each entry has tags + category populated.
    expect(inbox[0].tags).toEqual([])
    expect(inbox[0].category).toBeNull()
  })

  it('listInbox excludes soft-deleted inbox entries', async () => {
    const live = await kbEntryService.create({ organisationId: orgId, title: 'Live', status: 'inbox' })
    const trashed = await kbEntryService.create({ organisationId: orgId, title: 'Trashed', status: 'inbox' })
    await kbEntryService.softDelete(trashed.id)

    const inbox = await kbEntryService.listInbox({ organisationId: orgId })
    expect(inbox.map(e => e.id)).toEqual([live.id])
  })

  it('listTrash returns soft-deleted entries regardless of status, sorted by deleted_at desc', async () => {
    const a = await kbEntryService.create({ organisationId: orgId, title: 'Trashed Draft' })
    const b = await kbEntryService.create({ organisationId: orgId, title: 'Trashed Verified', status: 'verified' })
    const c = await kbEntryService.create({ organisationId: orgId, title: 'Trashed Archived', status: 'archived' })
    await kbEntryService.create({ organisationId: orgId, title: 'Live Note' })

    await kbEntryService.softDelete(a.id)
    // Push a's deletedAt earlier so b/c sort newer.
    await db
      .update(schema.kbEntries)
      .set({ deletedAt: new Date(Date.now() - 120_000) })
      .where(eq(schema.kbEntries.id, a.id))
    await kbEntryService.softDelete(b.id)
    await db
      .update(schema.kbEntries)
      .set({ deletedAt: new Date(Date.now() - 60_000) })
      .where(eq(schema.kbEntries.id, b.id))
    await kbEntryService.softDelete(c.id)

    const trash = await kbEntryService.listTrash({ organisationId: orgId })
    expect(trash.map(e => e.id)).toEqual([c.id, b.id, a.id])
    // Statuses are preserved (trash spans every status).
    expect(trash.map(e => e.status).sort()).toEqual(['archived', 'draft', 'verified'])
  })

  it('softDelete -> restore round-trip preserves the entry status', async () => {
    const entry = await kbEntryService.create({ organisationId: orgId, title: 'Round-trip', status: 'verified' })
    await kbEntryService.softDelete(entry.id)
    const restored = await kbEntryService.restore(entry.id)
    expect(restored.status).toBe('verified')
    expect(restored.deletedAt).toBeNull()
  })

  it('purge hard-deletes a soft-deleted entry and cascades junction rows', async () => {
    const target = await kbEntryService.create({ organisationId: orgId, title: 'Target' })
    const entry = await kbEntryService.create({
      organisationId: orgId,
      title: 'Doomed',
      tagNames: ['alpha', 'beta'],
      body: 'See [[target]].',
    })
    // Junction rows exist before purge.
    const tagsBefore = await db.select().from(schema.kbEntryTags).where(eq(schema.kbEntryTags.entryId, entry.id))
    expect(tagsBefore).toHaveLength(2)
    const linksBefore = await db.select().from(schema.kbEntryLinks).where(eq(schema.kbEntryLinks.fromEntryId, entry.id))
    expect(linksBefore).toHaveLength(1)

    await kbEntryService.softDelete(entry.id)
    await kbEntryService.purge({ id: entry.id, organisationId: orgId })

    // findBySlug returns null for both default and includeDeleted scopes.
    expect(
      await kbEntryService.findBySlug({ organisationId: orgId, slug: entry.slug }),
    ).toBeNull()
    expect(
      await kbEntryService.findBySlug({ organisationId: orgId, slug: entry.slug, includeDeleted: true }),
    ).toBeNull()

    // Junction rows cascade.
    const tagsAfter = await db.select().from(schema.kbEntryTags).where(eq(schema.kbEntryTags.entryId, entry.id))
    expect(tagsAfter).toHaveLength(0)
    const linksAfter = await db.select().from(schema.kbEntryLinks).where(eq(schema.kbEntryLinks.fromEntryId, entry.id))
    expect(linksAfter).toHaveLength(0)

    // The unrelated target row is untouched.
    expect(
      await kbEntryService.findBySlug({ organisationId: orgId, slug: target.slug }),
    ).not.toBeNull()
  })

  it('purge throws KbCannotPurgeActiveError for a live entry', async () => {
    const entry = await kbEntryService.create({ organisationId: orgId, title: 'Still Alive' })
    await expect(
      kbEntryService.purge({ id: entry.id, organisationId: orgId }),
    ).rejects.toBeInstanceOf(KbCannotPurgeActiveError)
  })

  it('list default scope excludes both archived and soft-deleted', async () => {
    const live = await kbEntryService.create({ organisationId: orgId, title: 'Live' })
    const archived = await kbEntryService.create({ organisationId: orgId, title: 'Archived', status: 'archived' })
    const trashed = await kbEntryService.create({ organisationId: orgId, title: 'Trashed' })
    await kbEntryService.softDelete(trashed.id)

    const ids = (await kbEntryService.list({ organisationId: orgId })).map(e => e.id)
    expect(ids).toEqual([live.id])
    expect(ids).not.toContain(archived.id)
    expect(ids).not.toContain(trashed.id)
  })

  it('list({ includeDeleted: true }) includes deleted but still excludes archived', async () => {
    const live = await kbEntryService.create({ organisationId: orgId, title: 'Live' })
    const archived = await kbEntryService.create({ organisationId: orgId, title: 'Archived', status: 'archived' })
    const trashed = await kbEntryService.create({ organisationId: orgId, title: 'Trashed' })
    await kbEntryService.softDelete(trashed.id)

    const ids = (await kbEntryService.list({ organisationId: orgId, includeDeleted: true })).map(e => e.id)
    expect(ids).toContain(live.id)
    expect(ids).toContain(trashed.id)
    expect(ids).not.toContain(archived.id)
  })

  it('list({ includeArchived: true, includeDeleted: true }) includes everything', async () => {
    const live = await kbEntryService.create({ organisationId: orgId, title: 'Live' })
    const archived = await kbEntryService.create({ organisationId: orgId, title: 'Archived', status: 'archived' })
    const trashed = await kbEntryService.create({ organisationId: orgId, title: 'Trashed' })
    await kbEntryService.softDelete(trashed.id)

    const ids = (await kbEntryService.list({
      organisationId: orgId,
      includeArchived: true,
      includeDeleted: true,
    })).map(e => e.id)
    expect(ids.sort()).toEqual([live.id, archived.id, trashed.id].sort())
  })

  it('list({ status: "archived" }) returns archived entries even without includeArchived', async () => {
    const archived = await kbEntryService.create({
      organisationId: orgId,
      title: 'Archived',
      status: 'archived',
    })
    const ids = (await kbEntryService.list({ organisationId: orgId, status: 'archived' })).map(e => e.id)
    expect(ids).toEqual([archived.id])
  })
})

describe('kbEntryService — getLinkedTodos (T-2.8, REQ-TODO-3)', () => {
  let orgId: string

  beforeEach(async () => {
    orgId = (await setupOrg()).id
  })

  it('returns todos linked to the entry, excluding completed by default', async () => {
    const entry = await kbEntryService.create({ organisationId: orgId, title: 'Project A' })
    const active = await todoService.create({
      organisationId: orgId,
      title: 'Active task',
      kbEntryIds: [entry.id],
    })
    const done = await todoService.create({
      organisationId: orgId,
      title: 'Done task',
      kbEntryIds: [entry.id],
    })
    await todoService.complete(done.id)

    // Default — completed excluded.
    const defaultRows = await kbEntryService.getLinkedTodos({
      organisationId: orgId,
      entryId: entry.id,
    })
    expect(defaultRows.map(r => r.id)).toEqual([active.id])

    // includeCompleted: true — both surface.
    const allRows = await kbEntryService.getLinkedTodos({
      organisationId: orgId,
      entryId: entry.id,
      includeCompleted: true,
    })
    expect(allRows.map(r => r.id).sort()).toEqual([active.id, done.id].sort())

    // Soft-deleted todos are always excluded.
    await todoService.softDelete(active.id)
    const afterTrash = await kbEntryService.getLinkedTodos({
      organisationId: orgId,
      entryId: entry.id,
      includeCompleted: true,
    })
    expect(afterTrash.map(r => r.id)).toEqual([done.id])
  })

  it('is workspace-scoped: a todo in another workspace never surfaces', async () => {
    const orgB = (await setupOrg()).id
    const entryA = await kbEntryService.create({ organisationId: orgId, title: 'Notes' })

    // A todo in workspace A linked to the entry — should appear.
    const todoA = await todoService.create({
      organisationId: orgId,
      title: 'A-side',
      kbEntryIds: [entryA.id],
    })
    // A todo in workspace B that isn't linked to the entry. Adding a link
    // across workspaces is rejected at the service layer, so we exercise the
    // explicit organisationId guard by creating a same-id collision-resistant
    // unrelated todo.
    await todoService.create({
      organisationId: orgB,
      title: 'B-side',
    })

    const rowsA = await kbEntryService.getLinkedTodos({
      organisationId: orgId,
      entryId: entryA.id,
    })
    expect(rowsA.map(r => r.id)).toEqual([todoA.id])

    // Querying with workspace B's id returns nothing — even though the entry
    // technically lives in A, the service refuses to leak the link row.
    const rowsB = await kbEntryService.getLinkedTodos({
      organisationId: orgB,
      entryId: entryA.id,
    })
    expect(rowsB).toEqual([])
  })

  it('returns rows sorted by created_at DESC', async () => {
    const entry = await kbEntryService.create({ organisationId: orgId, title: 'Sorted' })
    const first = await todoService.create({
      organisationId: orgId,
      title: 'First',
      kbEntryIds: [entry.id],
    })
    // Manually advance the second row's createdAt so the ordering is stable
    // — `created_at DESC` should put the newer one first.
    const second = await todoService.create({
      organisationId: orgId,
      title: 'Second',
      kbEntryIds: [entry.id],
    })
    await db
      .update(schema.todos)
      .set({ createdAt: new Date(Date.now() + 1000) })
      .where(eq(schema.todos.id, second.id))

    const rows = await kbEntryService.getLinkedTodos({
      organisationId: orgId,
      entryId: entry.id,
    })
    expect(rows.map(r => r.id)).toEqual([second.id, first.id])
  })
})
