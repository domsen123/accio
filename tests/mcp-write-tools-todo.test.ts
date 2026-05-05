import type { McpToolContext } from '../server/features/orchestrator/mcp-server'
import type {
  TodoCompleteOutput,
  TodoCreateOutput,
  TodoLinkKbOutput,
  TodoSoftDeleteOutput,
  TodoUncompleteOutput,
  TodoUnlinkKbOutput,
  TodoUpdateOutput,
} from '../server/features/orchestrator/tools'

import { and, eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import * as schema from '../server/database/schema'
import {
  createKbCategoryService,
  createKbEntryService,
  createKbTagService,
} from '../server/features/kb/service'
import { McpToolNotFoundEntityError } from '../server/features/orchestrator/errors'
import { createMcpServer } from '../server/features/orchestrator/mcp-server'
import {
  registerReadTools,
  registerWriteToolsKb,
  registerWriteToolsTodo,
} from '../server/features/orchestrator/tools'
import { createTodoService } from '../server/features/todo/service'
import { getDatabase } from '../server/infrastructure/database/client'
import { createItemService } from '../server/infrastructure/database/item-service'

import { createOrganisationData, createUserData } from './factories'

// DB-backed integration tests for the MCP Todo write tools (T-3.5). Each tool
// is invoked at least once via `server.invoke(name, …)` so the validate-and-
// shape pipeline is exercised end-to-end.

const db = getDatabase('app')

const organisationsItemService = createItemService({ db, table: schema.organisations, tableName: 'organisations' })
const usersItemService = createItemService({ db, table: schema.users, tableName: 'users' })
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
  registerWriteToolsKb(server, {
    kbEntryService,
    kbCategoryService,
    kbTagService,
  })
  registerWriteToolsTodo(server, {
    todoService,
    kbEntryService,
  })
  return server
}

const setupOrg = async () => organisationsItemService.create(createOrganisationData())
const setupUser = async () => (await usersItemService.create(createUserData())).id

let userId = ''

const ctxFor = (organisationId: string, overrides: Partial<McpToolContext> = {}): McpToolContext => ({
  organisationId,
  userId,
  conversationId: 'conv-test',
  mode: 'read_write',
  ...overrides,
})

describe('mcp todo write tools — registry registration', () => {
  it('registers exactly the seven todo write tools, all mode=write', () => {
    const server = buildServer()
    const writeTools = server.list({ mode: 'write' })
    const todoNames = writeTools
      .map(t => t.name)
      .filter(n => n.startsWith('todo_'))
      .sort()
    expect(todoNames).toEqual([
      'todo_complete',
      'todo_create',
      'todo_link_kb',
      'todo_soft_delete',
      'todo_uncomplete',
      'todo_unlink_kb',
      'todo_update',
    ])
    for (const name of todoNames)
      expect(server.get(name)?.mode).toBe('write')
  })

  it('declares the expected static class for each todo write tool', () => {
    const server = buildServer()
    const klass = (name: string) => server.get(name)?.class
    expect(klass('todo_create')).toBe('auto')
    expect(klass('todo_update')).toBe('auto')
    expect(klass('todo_complete')).toBe('auto')
    expect(klass('todo_uncomplete')).toBe('auto')
    expect(klass('todo_soft_delete')).toBe('confirm')
    expect(klass('todo_link_kb')).toBe('auto')
    expect(klass('todo_unlink_kb')).toBe('auto')
  })
})

describe('todo_create (via registry)', () => {
  let orgId: string
  let otherOrgId: string

  beforeEach(async () => {
    userId = await setupUser()
    orgId = (await setupOrg()).id
    otherOrgId = (await setupOrg()).id
  })

  it('creates with title, priority, due_at, and stamps created_by', async () => {
    const server = buildServer()
    const dueAtIso = '2026-12-01T15:00:00.000Z'
    const r = await server.invoke<TodoCreateOutput>(
      'todo_create',
      { title: 'Buy groceries', priority: 'high', due_at: dueAtIso },
      ctxFor(orgId),
    )
    expect(r.toolName).toBe('todo_create')
    expect(r.result.title).toBe('Buy groceries')
    expect(r.result.priority).toBe('high')
    expect(r.result.due_at).toBe(dueAtIso)
    expect(r.result.parent_todo_id).toBeNull()

    const row = await todosItemService.readOne(r.result.id)
    expect(row).toBeTruthy()
    expect(row!.organisationId).toBe(orgId)
    expect(row!.createdBy).toBe(userId)
    expect(row!.dueAt!.toISOString()).toBe(dueAtIso)
  })

  it('resolves parent_todo_id under the same workspace', async () => {
    const parent = await todoService.create({ organisationId: orgId, title: 'parent' })
    const server = buildServer()
    const r = await server.invoke<TodoCreateOutput>(
      'todo_create',
      { title: 'child', parent_todo_id: parent.id },
      ctxFor(orgId),
    )
    expect(r.result.parent_todo_id).toBe(parent.id)
  })

  it('attaches tags', async () => {
    const server = buildServer()
    const r = await server.invoke<TodoCreateOutput>(
      'todo_create',
      { title: 'tagged', tags: ['urgent-prio', 'shopping'] },
      ctxFor(orgId),
    )
    const hydrated = await todoService.findById({ organisationId: orgId, id: r.result.id })
    expect(hydrated!.tags.map(t => t.name).sort()).toEqual(['shopping', 'urgent-prio'])
  })

  it('resolves kb_links by mix of slug and id and creates todo_kb_links rows', async () => {
    const e1 = await kbEntryService.create({ organisationId: orgId, title: 'Entry one', body: 'x' })
    const e2 = await kbEntryService.create({ organisationId: orgId, title: 'Entry two', body: 'y' })
    const server = buildServer()
    const r = await server.invoke<TodoCreateOutput>(
      'todo_create',
      { title: 'with kb links', kb_links: [e1.slug, e2.id] },
      ctxFor(orgId),
    )

    const links = await db
      .select({ entryId: schema.todoKbLinks.entryId })
      .from(schema.todoKbLinks)
      .where(eq(schema.todoKbLinks.todoId, r.result.id))
    const linkedIds = links.map(l => l.entryId).sort()
    expect(linkedIds).toEqual([e1.id, e2.id].sort())
  })

  it('throws McpToolNotFoundEntityError for an unknown kb slug', async () => {
    const server = buildServer()
    await expect(
      server.invoke('todo_create', { title: 't', kb_links: ['no-such-slug'] }, ctxFor(orgId)),
    ).rejects.toBeInstanceOf(McpToolNotFoundEntityError)
  })

  it('refuses cross-workspace kb slug and creates no row', async () => {
    const otherEntry = await kbEntryService.create({ organisationId: otherOrgId, title: 'theirs', body: 'x' })
    const server = buildServer()
    await expect(
      server.invoke('todo_create', { title: 't', kb_links: [otherEntry.slug] }, ctxFor(orgId)),
    ).rejects.toBeInstanceOf(McpToolNotFoundEntityError)

    const todosInOrg = await todoService.list({ organisationId: orgId })
    expect(todosInOrg).toEqual([])
  })
})

describe('todo_update (via registry)', () => {
  let orgId: string
  let otherOrgId: string

  beforeEach(async () => {
    userId = await setupUser()
    orgId = (await setupOrg()).id
    otherOrgId = (await setupOrg()).id
  })

  it('updates fields', async () => {
    const todo = await todoService.create({ organisationId: orgId, title: 'old', priority: 'low' })
    const server = buildServer()
    const r = await server.invoke<TodoUpdateOutput>(
      'todo_update',
      { id: todo.id, title: 'new', priority: 'urgent' },
      ctxFor(orgId),
    )
    expect(r.result.title).toBe('new')
    expect(r.result.priority).toBe('urgent')

    const row = await todosItemService.readOne(todo.id)
    expect(row!.title).toBe('new')
    expect(row!.priority).toBe('urgent')
  })

  it('throws McpToolNotFoundEntityError on bogus id', async () => {
    const server = buildServer()
    await expect(
      server.invoke('todo_update', { id: 'nope', title: 'x' }, ctxFor(orgId)),
    ).rejects.toBeInstanceOf(McpToolNotFoundEntityError)
  })

  it('refuses cross-workspace todo id (entry not modified)', async () => {
    const todo = await todoService.create({ organisationId: otherOrgId, title: 'theirs' })
    const server = buildServer()
    await expect(
      server.invoke('todo_update', { id: todo.id, title: 'hijack' }, ctxFor(orgId)),
    ).rejects.toBeInstanceOf(McpToolNotFoundEntityError)

    const stillThere = await todosItemService.readOne(todo.id)
    expect(stillThere!.title).toBe('theirs')
  })
})

describe('todo_complete / todo_uncomplete (via registry)', () => {
  let orgId: string

  beforeEach(async () => {
    userId = await setupUser()
    orgId = (await setupOrg()).id
  })

  it('round-trips completed_at', async () => {
    const todo = await todoService.create({ organisationId: orgId, title: 't' })
    const server = buildServer()

    const completeRes = await server.invoke<TodoCompleteOutput>(
      'todo_complete',
      { id: todo.id },
      ctxFor(orgId),
    )
    expect(completeRes.result.id).toBe(todo.id)
    expect(completeRes.result.completed_at).toMatch(/^\d{4}-\d{2}-\d{2}T/)

    const afterComplete = await todosItemService.readOne(todo.id)
    expect(afterComplete!.completedAt).not.toBeNull()

    const uncompleteRes = await server.invoke<TodoUncompleteOutput>(
      'todo_uncomplete',
      { id: todo.id },
      ctxFor(orgId),
    )
    expect(uncompleteRes.result.id).toBe(todo.id)

    const afterUncomplete = await todosItemService.readOne(todo.id)
    expect(afterUncomplete!.completedAt).toBeNull()
  })

  it('cross-workspace complete is refused', async () => {
    const otherOrgId = (await setupOrg()).id
    const todo = await todoService.create({ organisationId: otherOrgId, title: 'theirs' })
    const server = buildServer()
    await expect(
      server.invoke('todo_complete', { id: todo.id }, ctxFor(orgId)),
    ).rejects.toBeInstanceOf(McpToolNotFoundEntityError)
    const stillActive = await todosItemService.readOne(todo.id)
    expect(stillActive!.completedAt).toBeNull()
  })
})

describe('todo_soft_delete (via registry)', () => {
  let orgId: string
  let otherOrgId: string

  beforeEach(async () => {
    userId = await setupUser()
    orgId = (await setupOrg()).id
    otherOrgId = (await setupOrg()).id
  })

  it('static class is confirm', () => {
    const server = buildServer()
    expect(server.get('todo_soft_delete')?.class).toBe('confirm')
  })

  it('sets deleted_at and subsequent todo_get returns not-found', async () => {
    const todo = await todoService.create({ organisationId: orgId, title: 'kill me' })
    const server = buildServer()
    // todo_soft_delete is confirm-class — bypass the T-3.6 gate.
    const r = await server.invoke<TodoSoftDeleteOutput>(
      'todo_soft_delete',
      { id: todo.id },
      ctxFor(orgId, { confirmationToken: 'test-confirmed' }),
    )
    expect(r.result.id).toBe(todo.id)
    expect(r.result.deleted_at).toMatch(/^\d{4}-\d{2}-\d{2}T/)

    await expect(
      server.invoke('todo_get', { id: todo.id }, ctxFor(orgId)),
    ).rejects.toBeInstanceOf(McpToolNotFoundEntityError)
  })

  it('refuses cross-workspace soft-delete (todo remains live)', async () => {
    const todo = await todoService.create({ organisationId: otherOrgId, title: 'theirs' })
    const server = buildServer()
    await expect(
      server.invoke('todo_soft_delete', { id: todo.id }, ctxFor(orgId, { confirmationToken: 'test-confirmed' })),
    ).rejects.toBeInstanceOf(McpToolNotFoundEntityError)

    const stillLive = await todosItemService.readOne(todo.id)
    expect(stillLive!.deletedAt).toBeNull()
  })
})

describe('todo_link_kb / todo_unlink_kb (via registry)', () => {
  let orgId: string
  let otherOrgId: string

  beforeEach(async () => {
    userId = await setupUser()
    orgId = (await setupOrg()).id
    otherOrgId = (await setupOrg()).id
  })

  it('link round-trip with idempotency', async () => {
    const todo = await todoService.create({ organisationId: orgId, title: 't' })
    const entry = await kbEntryService.create({ organisationId: orgId, title: 'e', body: 'x' })
    const server = buildServer()

    const r1 = await server.invoke<TodoLinkKbOutput>(
      'todo_link_kb',
      { todo_id: todo.id, kb_slug_or_id: entry.slug },
      ctxFor(orgId),
    )
    expect(r1.result).toEqual({ todo_id: todo.id, kb_entry_id: entry.id })

    // Idempotent: linking again succeeds, no duplicate row.
    const r2 = await server.invoke<TodoLinkKbOutput>(
      'todo_link_kb',
      { todo_id: todo.id, kb_slug_or_id: entry.id },
      ctxFor(orgId),
    )
    expect(r2.result).toEqual({ todo_id: todo.id, kb_entry_id: entry.id })

    const links = await db
      .select()
      .from(schema.todoKbLinks)
      .where(
        and(
          eq(schema.todoKbLinks.todoId, todo.id),
          eq(schema.todoKbLinks.entryId, entry.id),
        ),
      )
    expect(links).toHaveLength(1)

    // Unlink removes; second unlink is a silent no-op (removed: false).
    const u1 = await server.invoke<TodoUnlinkKbOutput>(
      'todo_unlink_kb',
      { todo_id: todo.id, kb_slug_or_id: entry.slug },
      ctxFor(orgId),
    )
    expect(u1.result).toEqual({ todo_id: todo.id, kb_entry_id: entry.id, removed: true })

    const u2 = await server.invoke<TodoUnlinkKbOutput>(
      'todo_unlink_kb',
      { todo_id: todo.id, kb_slug_or_id: entry.slug },
      ctxFor(orgId),
    )
    expect(u2.result).toEqual({ todo_id: todo.id, kb_entry_id: entry.id, removed: false })
  })

  it('cross-workspace KB slug throws not-found and creates no row', async () => {
    const todo = await todoService.create({ organisationId: orgId, title: 't' })
    const otherEntry = await kbEntryService.create({ organisationId: otherOrgId, title: 'theirs', body: 'x' })
    const server = buildServer()
    await expect(
      server.invoke('todo_link_kb', { todo_id: todo.id, kb_slug_or_id: otherEntry.slug }, ctxFor(orgId)),
    ).rejects.toBeInstanceOf(McpToolNotFoundEntityError)

    const links = await db
      .select()
      .from(schema.todoKbLinks)
      .where(eq(schema.todoKbLinks.todoId, todo.id))
    expect(links).toHaveLength(0)
  })

  it('cross-workspace todo id throws not-found', async () => {
    const otherTodo = await todoService.create({ organisationId: otherOrgId, title: 'theirs' })
    const entry = await kbEntryService.create({ organisationId: orgId, title: 'e', body: 'x' })
    const server = buildServer()
    await expect(
      server.invoke('todo_link_kb', { todo_id: otherTodo.id, kb_slug_or_id: entry.slug }, ctxFor(orgId)),
    ).rejects.toBeInstanceOf(McpToolNotFoundEntityError)
  })
})
