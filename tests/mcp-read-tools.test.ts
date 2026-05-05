import type { McpToolContext } from '../server/features/orchestrator/mcp-server'
import type {
  KbGetEntryOutput,
  KbListCategoriesOutput,
  KbListTagsOutput,
  KbSearchOutput,
  TodoGetOutput,
  TodoSearchOutput,
} from '../server/features/orchestrator/tools'

import { beforeEach, describe, expect, it } from 'vitest'
import * as schema from '../server/database/schema'
import {
  createKbCategoryService,
  createKbEntryService,
  createKbTagService,
} from '../server/features/kb/service'
import { McpToolNotFoundEntityError } from '../server/features/orchestrator/errors'
import { createMcpServer } from '../server/features/orchestrator/mcp-server'
import { registerReadTools } from '../server/features/orchestrator/tools'
import { createTodoService } from '../server/features/todo/service'
import { getDatabase } from '../server/infrastructure/database/client'
import { createItemService } from '../server/infrastructure/database/item-service'

import { createOrganisationData } from './factories'

// DB-backed integration tests for the MCP read tools (T-3.3). Each tool is
// invoked at least once through the registry (`server.invoke(name, …)`) so the
// validate-and-shape pipeline is exercised end-to-end.

const db = getDatabase('app')

const organisationsItemService = createItemService({ db, table: schema.organisations, tableName: 'organisations' })
const kbEntriesItemService = createItemService({ db, table: schema.kbEntries, tableName: 'kbEntries' })
const kbCategoriesItemService = createItemService({ db, table: schema.kbCategories, tableName: 'kbCategories' })
const kbTagsItemService = createItemService({ db, table: schema.kbTags, tableName: 'kbTags' })
const todosItemService = createItemService({ db, table: schema.todos, tableName: 'todos' })

const kbCategoryService = createKbCategoryService({ kbCategoriesItemService })
const kbTagService = createKbTagService({ db, kbTagsItemService })
const kbEntryService = createKbEntryService({ db, kbEntriesItemService, kbTagService })
const todoService = createTodoService({ db, todosItemService, kbTagService })

const buildServer = () => {
  const server = createMcpServer()
  registerReadTools(server, {
    kbEntryService,
    kbCategoryService,
    kbTagService,
    todoService,
    db,
  })
  return server
}

const setupOrg = async () => organisationsItemService.create(createOrganisationData())

const ctxFor = (organisationId: string): McpToolContext => ({
  organisationId,
  userId: 'user-test',
  conversationId: 'conv-test',
  mode: 'read_only',
})

describe('mcp read tools — registry registration', () => {
  it('registers every read tool, all class=auto / mode=read', () => {
    const server = buildServer()
    const tools = server.list({ mode: 'read' })
    const names = tools.map(t => t.name).sort()
    expect(names).toEqual([
      'kb_get_entry',
      'kb_list_categories',
      'kb_list_tags',
      'kb_search',
      'project_list_commits',
      'project_list_issues',
      'project_list_pulls',
      'project_list_repos',
      'todo_get',
      'todo_search',
    ])
    for (const tool of tools) {
      expect(tool.class).toBe('auto')
      expect(tool.mode).toBe('read')
    }
    // No write tools yet (T-3.4 / T-3.5 will add them).
    expect(server.list({ mode: 'write' })).toHaveLength(0)
  })
})

describe('kb_search (via registry)', () => {
  let orgId: string
  let otherOrgId: string

  beforeEach(async () => {
    orgId = (await setupOrg()).id
    otherOrgId = (await setupOrg()).id
  })

  it('returns ranked entries matching the FTS query, scoped to the workspace', async () => {
    await kbEntryService.create({
      organisationId: orgId,
      title: 'Widget assembly notes',
      body: 'How to put together the widget.',
    })
    await kbEntryService.create({
      organisationId: orgId,
      title: 'Unrelated topic',
      body: 'Nothing about gadgets here.',
    })
    // Same title in another workspace must NOT leak into the result.
    await kbEntryService.create({
      organisationId: otherOrgId,
      title: 'Widget secret',
      body: 'cross-workspace data',
    })

    const server = buildServer()
    const result = await server.invoke<KbSearchOutput>(
      'kb_search',
      { query: 'widget' },
      ctxFor(orgId),
    )

    expect(result.toolName).toBe('kb_search')
    expect(result.result.results).toHaveLength(1)
    const hit = result.result.results[0]
    expect(hit.title).toBe('Widget assembly notes')
    expect(hit.slug).toBeDefined()
    expect(hit.score).toBeGreaterThan(0)
    expect(hit.author_type).toBe('human')
    expect(hit.status).toBe('draft')
    expect(hit.snippet.length).toBeGreaterThan(0)
  })

  it('default status filter excludes inbox and archived entries', async () => {
    await kbEntryService.create({ organisationId: orgId, title: 'foo draft', body: 'x', status: 'draft' })
    await kbEntryService.create({ organisationId: orgId, title: 'foo inbox', body: 'x', status: 'inbox' })
    await kbEntryService.create({ organisationId: orgId, title: 'foo verified', body: 'x', status: 'verified' })
    await kbEntryService.create({ organisationId: orgId, title: 'foo archived', body: 'x', status: 'archived' })

    const server = buildServer()
    const r = await server.invoke<KbSearchOutput>('kb_search', { query: 'foo' }, ctxFor(orgId))
    const titles = r.result.results.map(x => x.title).sort()
    expect(titles).toEqual(['foo draft', 'foo verified'])
  })

  it('explicit status filter overrides the default', async () => {
    await kbEntryService.create({ organisationId: orgId, title: 'foo inbox', body: 'x', status: 'inbox' })
    await kbEntryService.create({ organisationId: orgId, title: 'foo draft', body: 'x', status: 'draft' })

    const server = buildServer()
    const r = await server.invoke<KbSearchOutput>(
      'kb_search',
      { query: 'foo', status: ['inbox'] },
      ctxFor(orgId),
    )
    expect(r.result.results.map(x => x.title)).toEqual(['foo inbox'])
  })

  it('tag filter narrows the result set; unknown tag → zero results', async () => {
    await kbEntryService.create({
      organisationId: orgId,
      title: 'tagged alpha',
      body: 'foo body',
      tagNames: ['alpha'],
    })
    await kbEntryService.create({
      organisationId: orgId,
      title: 'tagged beta',
      body: 'foo body',
      tagNames: ['beta'],
    })

    const server = buildServer()
    const onlyAlpha = await server.invoke<KbSearchOutput>(
      'kb_search',
      { query: 'foo', tags: ['alpha'] },
      ctxFor(orgId),
    )
    expect(onlyAlpha.result.results.map(r => r.title)).toEqual(['tagged alpha'])

    const unknown = await server.invoke<KbSearchOutput>(
      'kb_search',
      { query: 'foo', tags: ['nonexistent'] },
      ctxFor(orgId),
    )
    expect(unknown.result.results).toEqual([])
  })

  it('caps limit at 25 via the input schema', async () => {
    const server = buildServer()
    await expect(
      server.invoke('kb_search', { query: 'foo', limit: 26 }, ctxFor(orgId)),
    ).rejects.toThrow()
  })
})

describe('kb_get_entry (via registry)', () => {
  let orgId: string
  let otherOrgId: string

  beforeEach(async () => {
    orgId = (await setupOrg()).id
    otherOrgId = (await setupOrg()).id
  })

  it('returns the full entry with category and tags by slug', async () => {
    const cat = await kbCategoryService.create({ organisationId: orgId, name: 'Recipes', slug: 'recipes' })
    const entry = await kbEntryService.create({
      organisationId: orgId,
      title: 'Pasta carbonara',
      body: 'Italian classic',
      categoryId: cat.id,
      tagNames: ['italian', 'dinner'],
    })

    const server = buildServer()
    const r = await server.invoke<KbGetEntryOutput>(
      'kb_get_entry',
      { slug_or_id: entry.slug },
      ctxFor(orgId),
    )

    expect(r.result.id).toBe(entry.id)
    expect(r.result.slug).toBe(entry.slug)
    expect(r.result.title).toBe('Pasta carbonara')
    expect(r.result.body_md).toBe('Italian classic')
    expect(r.result.category?.slug).toBe('recipes')
    expect(r.result.tags.map(t => t.name).sort()).toEqual(['dinner', 'italian'])
    expect(r.result.backlinks).toBeUndefined()
  })

  it('resolves by id when the input is a ULID', async () => {
    const entry = await kbEntryService.create({ organisationId: orgId, title: 'By id', body: '' })
    const server = buildServer()
    const r = await server.invoke<KbGetEntryOutput>(
      'kb_get_entry',
      { slug_or_id: entry.id },
      ctxFor(orgId),
    )
    expect(r.result.id).toBe(entry.id)
  })

  it('throws McpToolNotFoundEntityError for an unknown slug', async () => {
    const server = buildServer()
    await expect(
      server.invoke('kb_get_entry', { slug_or_id: 'does-not-exist' }, ctxFor(orgId)),
    ).rejects.toBeInstanceOf(McpToolNotFoundEntityError)
  })

  it('does not return entries from another workspace', async () => {
    const entry = await kbEntryService.create({ organisationId: otherOrgId, title: 'Other org note', body: '' })
    const server = buildServer()
    await expect(
      server.invoke('kb_get_entry', { slug_or_id: entry.slug }, ctxFor(orgId)),
    ).rejects.toBeInstanceOf(McpToolNotFoundEntityError)
  })

  it('returns backlinks when include_backlinks is true', async () => {
    const target = await kbEntryService.create({
      organisationId: orgId,
      title: 'Target Doc',
      body: '',
    })
    await kbEntryService.create({
      organisationId: orgId,
      title: 'Source Doc',
      body: `references [[${target.slug}]]`,
    })

    const server = buildServer()
    const r = await server.invoke<KbGetEntryOutput>(
      'kb_get_entry',
      { slug_or_id: target.slug, include_backlinks: true },
      ctxFor(orgId),
    )
    expect(r.result.backlinks).toBeDefined()
    expect(r.result.backlinks?.map(b => b.title)).toEqual(['Source Doc'])
  })
})

describe('kb_list_categories (via registry)', () => {
  let orgId: string
  let otherOrgId: string

  beforeEach(async () => {
    orgId = (await setupOrg()).id
    otherOrgId = (await setupOrg()).id
  })

  it('returns a parent→children tree, scoped to the workspace', async () => {
    const food = await kbCategoryService.create({ organisationId: orgId, name: 'Food', slug: 'food' })
    await kbCategoryService.create({ organisationId: orgId, name: 'Italian', slug: 'italian', parentId: food.id })
    await kbCategoryService.create({ organisationId: orgId, name: 'French', slug: 'french', parentId: food.id })
    await kbCategoryService.create({ organisationId: orgId, name: 'Travel', slug: 'travel' })

    // Cross-workspace category MUST NOT appear.
    await kbCategoryService.create({ organisationId: otherOrgId, name: 'Other', slug: 'other' })

    const server = buildServer()
    const r = await server.invoke<KbListCategoriesOutput>(
      'kb_list_categories',
      {},
      ctxFor(orgId),
    )

    const names = r.result.categories.map(n => n.name).sort()
    expect(names).toEqual(['Food', 'Travel'])
    const foodNode = r.result.categories.find(n => n.slug === 'food')!
    expect(foodNode.children.map(c => c.slug).sort()).toEqual(['french', 'italian'])
  })
})

describe('kb_list_tags (via registry)', () => {
  let orgId: string
  let otherOrgId: string

  beforeEach(async () => {
    orgId = (await setupOrg()).id
    otherOrgId = (await setupOrg()).id
  })

  it('returns tags with usage counts, sorted by usage desc then name asc', async () => {
    await kbEntryService.create({
      organisationId: orgId,
      title: 'A',
      body: '',
      tagNames: ['popular', 'rare'],
    })
    await kbEntryService.create({
      organisationId: orgId,
      title: 'B',
      body: '',
      tagNames: ['popular'],
    })
    await kbEntryService.create({
      organisationId: orgId,
      title: 'C',
      body: '',
      tagNames: ['popular', 'middle'],
    })

    // Cross-workspace tag must not leak.
    await kbEntryService.create({
      organisationId: otherOrgId,
      title: 'X',
      body: '',
      tagNames: ['popular'],
    })

    const server = buildServer()
    const r = await server.invoke<KbListTagsOutput>('kb_list_tags', {}, ctxFor(orgId))
    const tags = r.result.tags
    expect(tags.map(t => t.name)).toEqual(['popular', 'middle', 'rare'])
    expect(tags[0].usage_count).toBe(3)
    expect(tags[0].slug).toBe('popular')
    expect(tags[1].usage_count).toBe(1)
    expect(tags[2].usage_count).toBe(1)
  })
})

describe('todo_search (via registry)', () => {
  let orgId: string
  let otherOrgId: string

  beforeEach(async () => {
    orgId = (await setupOrg()).id
    otherOrgId = (await setupOrg()).id
  })

  it('default (no view) lists active todos in the workspace', async () => {
    await todoService.create({ organisationId: orgId, title: 'mine alpha' })
    await todoService.create({ organisationId: otherOrgId, title: 'theirs' })

    const server = buildServer()
    const r = await server.invoke<TodoSearchOutput>('todo_search', {}, ctxFor(orgId))
    expect(r.result.results.map(x => x.title)).toEqual(['mine alpha'])
  })

  it('view: \'today\' returns only todos due today or overdue', async () => {
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0)
    const inFiveDays = new Date(today.getTime() + 5 * 86_400_000)

    await todoService.create({ organisationId: orgId, title: 'due today', dueAt: today })
    await todoService.create({ organisationId: orgId, title: 'due later', dueAt: inFiveDays })
    await todoService.create({ organisationId: orgId, title: 'no due date' })

    const server = buildServer()
    const r = await server.invoke<TodoSearchOutput>(
      'todo_search',
      { view: 'today' },
      ctxFor(orgId),
    )
    expect(r.result.results.map(x => x.title)).toEqual(['due today'])
  })

  it('linked_to_kb narrows to todos linked to the given KB entry (slug or id)', async () => {
    const entry = await kbEntryService.create({ organisationId: orgId, title: 'Doc', body: '' })
    const linked = await todoService.create({
      organisationId: orgId,
      title: 'linked todo',
      kbEntryIds: [entry.id],
    })
    await todoService.create({ organisationId: orgId, title: 'unlinked todo' })

    const server = buildServer()
    const bySlug = await server.invoke<TodoSearchOutput>(
      'todo_search',
      { linked_to_kb: entry.slug },
      ctxFor(orgId),
    )
    expect(bySlug.result.results.map(x => x.id)).toEqual([linked.id])

    const byId = await server.invoke<TodoSearchOutput>(
      'todo_search',
      { linked_to_kb: entry.id },
      ctxFor(orgId),
    )
    expect(byId.result.results.map(x => x.id)).toEqual([linked.id])

    const unknown = await server.invoke<TodoSearchOutput>(
      'todo_search',
      { linked_to_kb: 'nonexistent-slug' },
      ctxFor(orgId),
    )
    expect(unknown.result.results).toEqual([])
  })

  it('priority filter narrows results', async () => {
    await todoService.create({ organisationId: orgId, title: 'urgent thing', priority: 'urgent' })
    await todoService.create({ organisationId: orgId, title: 'low thing', priority: 'low' })

    const server = buildServer()
    const r = await server.invoke<TodoSearchOutput>(
      'todo_search',
      { priority: 'urgent' },
      ctxFor(orgId),
    )
    expect(r.result.results.map(x => x.title)).toEqual(['urgent thing'])
  })
})

describe('todo_get (via registry)', () => {
  let orgId: string

  beforeEach(async () => {
    orgId = (await setupOrg()).id
  })

  it('returns the todo with subtasks and linked KB entries', async () => {
    const entry = await kbEntryService.create({ organisationId: orgId, title: 'Doc', body: '' })
    const parent = await todoService.create({
      organisationId: orgId,
      title: 'Parent',
      kbEntryIds: [entry.id],
      tagNames: ['work'],
    })
    const childA = await todoService.create({
      organisationId: orgId,
      title: 'Child A',
      parentTodoId: parent.id,
      priority: 'high',
    })
    const childB = await todoService.create({
      organisationId: orgId,
      title: 'Child B',
      parentTodoId: parent.id,
    })

    const server = buildServer()
    const r = await server.invoke<TodoGetOutput>(
      'todo_get',
      { id: parent.id },
      ctxFor(orgId),
    )

    expect(r.result.id).toBe(parent.id)
    expect(r.result.title).toBe('Parent')
    expect(r.result.tags.map(t => t.name)).toEqual(['work'])
    expect(r.result.linked_kb_entries.map(e => e.id)).toEqual([entry.id])
    expect(r.result.subtask_count).toBe(2)
    const subtaskIds = r.result.subtasks.map(s => s.id).sort()
    expect(subtaskIds).toEqual([childA.id, childB.id].sort())
  })

  it('throws McpToolNotFoundEntityError for an unknown id', async () => {
    const server = buildServer()
    await expect(
      server.invoke('todo_get', { id: 'does-not-exist' }, ctxFor(orgId)),
    ).rejects.toBeInstanceOf(McpToolNotFoundEntityError)
  })

  it('does not return a todo from another workspace', async () => {
    const otherOrgId = (await setupOrg()).id
    const todo = await todoService.create({ organisationId: otherOrgId, title: 'theirs' })

    const server = buildServer()
    await expect(
      server.invoke('todo_get', { id: todo.id }, ctxFor(orgId)),
    ).rejects.toBeInstanceOf(McpToolNotFoundEntityError)
  })
})
