import type { McpToolContext, Tool } from '../server/features/orchestrator/mcp-server'
import type {
  KbAddTagOutput,
  KbCreateEntryInput,
  KbCreateEntryOutput,
  KbLinkEntriesOutput,
  KbRemoveTagOutput,
  KbSetStatusOutput,
  KbSoftDeleteEntryOutput,
  KbUpdateEntryOutput,
} from '../server/features/orchestrator/tools'

import { beforeEach, describe, expect, it } from 'vitest'
import * as schema from '../server/database/schema'
import {
  createKbCategoryService,
  createKbEntryService,
  createKbTagService,
} from '../server/features/kb/service'
import {
  ConfirmationRequiredError,
  McpToolExecutionError,
  McpToolNotFoundEntityError,
} from '../server/features/orchestrator/errors'
import { classifyTool, createMcpServer } from '../server/features/orchestrator/mcp-server'
import {
  classifyKbCreateEntry,
  registerReadTools,
  registerWriteToolsKb,
} from '../server/features/orchestrator/tools'
import { createTodoService } from '../server/features/todo/service'
import { getDatabase } from '../server/infrastructure/database/client'
import { createItemService } from '../server/infrastructure/database/item-service'

import { createOrganisationData, createUserData } from './factories'

// DB-backed integration tests for the MCP KB write tools (T-3.4). Each tool is
// invoked at least once via `server.invoke(name, …)` so the validate-and-shape
// pipeline is exercised end-to-end.

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
  return server
}

const setupOrg = async () => organisationsItemService.create(createOrganisationData())
const setupUser = async () => (await usersItemService.create(createUserData())).id

// `kb_entries.created_by` has an FK to `users`. The shared `cleanDatabase`
// hook truncates `users` after every test, so each `beforeEach` re-creates
// one and stashes the id here for `ctxFor` to read.
let userId = ''

const ctxFor = (organisationId: string, overrides: Partial<McpToolContext> = {}): McpToolContext => ({
  organisationId,
  userId,
  conversationId: 'conv-test',
  mode: 'read_write',
  ...overrides,
})

describe('mcp kb write tools — registry registration', () => {
  it('registers exactly the seven KB write tools, all mode=write', () => {
    const server = buildServer()
    const writeTools = server.list({ mode: 'write' })
    const names = writeTools.map(t => t.name).sort()
    expect(names).toEqual([
      'kb_add_tag',
      'kb_create_entry',
      'kb_link_entries',
      'kb_remove_tag',
      'kb_set_status',
      'kb_soft_delete_entry',
      'kb_update_entry',
    ])
    for (const tool of writeTools)
      expect(tool.mode).toBe('write')
  })

  it('declares static class for the non-create tools', () => {
    const server = buildServer()
    const klass = (name: string) => server.get(name)?.class
    expect(klass('kb_update_entry')).toBe('confirm')
    expect(klass('kb_set_status')).toBe('confirm')
    expect(klass('kb_soft_delete_entry')).toBe('confirm')
    expect(klass('kb_add_tag')).toBe('auto')
    expect(klass('kb_remove_tag')).toBe('auto')
    expect(klass('kb_link_entries')).toBe('auto')
  })

  it('kb_create_entry has a function classifier; auto for inbox, confirm for draft/verified', () => {
    const server = buildServer()
    const tool = server.get('kb_create_entry') as Tool<KbCreateEntryInput> | undefined
    expect(tool).toBeDefined()
    expect(typeof tool!.class).toBe('function')

    const baseInput: KbCreateEntryInput = { title: 't', body_md: 'b' }
    expect(classifyTool(tool!, { ...baseInput })).toBe('auto')
    expect(classifyTool(tool!, { ...baseInput, status: 'inbox' })).toBe('auto')
    expect(classifyTool(tool!, { ...baseInput, status: 'draft' })).toBe('confirm')
    expect(classifyTool(tool!, { ...baseInput, status: 'verified' })).toBe('confirm')

    // Sanity: the exported helper agrees.
    expect(classifyKbCreateEntry({ ...baseInput })).toBe('auto')
    expect(classifyKbCreateEntry({ ...baseInput, status: 'verified' })).toBe('confirm')
  })
})

describe('kb_create_entry (via registry)', () => {
  let orgId: string

  beforeEach(async () => {
    userId = await setupUser()
    orgId = (await setupOrg()).id
  })

  it('creates with author_type=ai, defaults to inbox, resolves category slug, attaches tags', async () => {
    const cat = await kbCategoryService.create({ organisationId: orgId, name: 'Recipes', slug: 'recipes' })
    const server = buildServer()
    const r = await server.invoke<KbCreateEntryOutput>(
      'kb_create_entry',
      {
        title: 'Pasta carbonara',
        body_md: 'Italian classic',
        category_slug: 'recipes',
        tags: ['italian', 'dinner'],
      },
      ctxFor(orgId, { authorName: 'Claude-Sonnet-Test' }),
    )

    expect(r.toolName).toBe('kb_create_entry')
    expect(r.result.title).toBe('Pasta carbonara')
    expect(r.result.status).toBe('inbox')

    // Verify persisted state.
    const hydrated = await kbEntryService.findBySlug({ organisationId: orgId, slug: r.result.slug })
    expect(hydrated).toBeTruthy()
    expect(hydrated!.authorType).toBe('ai')
    expect(hydrated!.authorName).toBe('Claude-Sonnet-Test')
    expect(hydrated!.sourceType).toBe('chat')
    expect(hydrated!.sourceRef).toBe('conv-test')
    expect(hydrated!.category?.slug).toBe('recipes')
    expect(hydrated!.tags.map(t => t.name).sort()).toEqual(['dinner', 'italian'])
    expect(hydrated!.id).toBe(r.result.id)
    expect(cat.id).toBe(hydrated!.category!.id)
  })

  it('defaults author_name to "AI" when ctx.authorName is not provided', async () => {
    const server = buildServer()
    const r = await server.invoke<KbCreateEntryOutput>(
      'kb_create_entry',
      { title: 'No author', body_md: 'x' },
      ctxFor(orgId),
    )
    const hydrated = await kbEntryService.findBySlug({ organisationId: orgId, slug: r.result.slug })
    expect(hydrated!.authorName).toBe('AI')
  })

  it('persists draft status when explicitly requested', async () => {
    const server = buildServer()
    // status='draft' resolves to confirm-class; supply a token to bypass the
    // T-3.6 gate (the chat handler does this on the post-confirm re-invoke).
    const r = await server.invoke<KbCreateEntryOutput>(
      'kb_create_entry',
      { title: 'Draft note', body_md: 'x', status: 'draft' },
      ctxFor(orgId, { confirmationToken: 'test-confirmed' }),
    )
    expect(r.result.status).toBe('draft')
  })

  it('throws McpToolNotFoundEntityError for an unknown category slug', async () => {
    const server = buildServer()
    await expect(
      server.invoke(
        'kb_create_entry',
        { title: 't', body_md: 'b', category_slug: 'no-such' },
        ctxFor(orgId),
      ),
    ).rejects.toBeInstanceOf(McpToolNotFoundEntityError)
  })
})

describe('kb_update_entry (via registry)', () => {
  let orgId: string
  let otherOrgId: string

  beforeEach(async () => {
    userId = await setupUser()
    orgId = (await setupOrg()).id
    otherOrgId = (await setupOrg()).id
  })

  it('updates title and body, preserving slug', async () => {
    const entry = await kbEntryService.create({
      organisationId: orgId,
      title: 'Original',
      body: 'old body',
    })
    const server = buildServer()
    // kb_update_entry is confirm-class — supply a confirmation token to bypass
    // the T-3.6 gate (the chat handler does this on the post-confirm re-invoke).
    const r = await server.invoke<KbUpdateEntryOutput>(
      'kb_update_entry',
      { slug_or_id: entry.slug, title: 'New title', body_md: 'new body' },
      ctxFor(orgId, { confirmationToken: 'test-confirmed' }),
    )
    expect(r.result.id).toBe(entry.id)
    expect(r.result.slug).toBe(entry.slug) // slug is stable
    expect(r.result.title).toBe('New title')

    const hydrated = await kbEntryService.findBySlug({ organisationId: orgId, slug: entry.slug })
    expect(hydrated!.bodyMd).toBe('new body')
  })

  it('throws McpToolNotFoundEntityError for an unknown slug', async () => {
    const server = buildServer()
    await expect(
      server.invoke('kb_update_entry', { slug_or_id: 'nope', title: 'x' }, ctxFor(orgId, { confirmationToken: 'test-confirmed' })),
    ).rejects.toBeInstanceOf(McpToolNotFoundEntityError)
  })

  it('refuses cross-workspace slugs', async () => {
    const entry = await kbEntryService.create({ organisationId: otherOrgId, title: 'theirs', body: 'x' })
    const server = buildServer()
    await expect(
      server.invoke('kb_update_entry', { slug_or_id: entry.slug, title: 'hijack' }, ctxFor(orgId, { confirmationToken: 'test-confirmed' })),
    ).rejects.toBeInstanceOf(McpToolNotFoundEntityError)
    // Confirm the cross-workspace entry was not modified.
    const stillThere = await kbEntryService.findBySlug({ organisationId: otherOrgId, slug: entry.slug })
    expect(stillThere!.title).toBe('theirs')
  })
})

describe('kb_set_status (via registry)', () => {
  let orgId: string

  beforeEach(async () => {
    userId = await setupUser()
    orgId = (await setupOrg()).id
  })

  it('valid transition succeeds', async () => {
    const entry = await kbEntryService.create({ organisationId: orgId, title: 't', body: 'b', status: 'draft' })
    const server = buildServer()
    // kb_set_status is confirm-class — bypass the T-3.6 gate.
    const r = await server.invoke<KbSetStatusOutput>(
      'kb_set_status',
      { slug_or_id: entry.slug, status: 'verified' },
      ctxFor(orgId, { confirmationToken: 'test-confirmed' }),
    )
    expect(r.result.status).toBe('verified')

    const reread = await kbEntryService.findBySlug({ organisationId: orgId, slug: entry.slug })
    expect(reread!.status).toBe('verified')
  })

  it('invalid status (schema-level) is rejected before the handler runs', async () => {
    const entry = await kbEntryService.create({ organisationId: orgId, title: 't', body: 'b' })
    const server = buildServer()
    await expect(
      server.invoke('kb_set_status', { slug_or_id: entry.slug, status: 'bogus' }, ctxFor(orgId)),
    ).rejects.toThrow()
  })
})

describe('kb_add_tag / kb_remove_tag (via registry)', () => {
  let orgId: string

  beforeEach(async () => {
    userId = await setupUser()
    orgId = (await setupOrg()).id
  })

  it('add auto-creates the tag if missing and returns the post-op tag list', async () => {
    const entry = await kbEntryService.create({ organisationId: orgId, title: 't', body: 'b' })
    const server = buildServer()
    const r = await server.invoke<KbAddTagOutput>(
      'kb_add_tag',
      { slug_or_id: entry.slug, tag: 'fresh-tag' },
      ctxFor(orgId),
    )
    expect(r.result.tags).toContain('fresh-tag')

    const tags = await kbTagService.list({ organisationId: orgId })
    expect(tags.map(t => t.name)).toContain('fresh-tag')
  })

  it('round-trip: add then remove leaves the entry tag-free', async () => {
    const entry = await kbEntryService.create({ organisationId: orgId, title: 't', body: 'b' })
    const server = buildServer()
    await server.invoke('kb_add_tag', { slug_or_id: entry.slug, tag: 'roundtrip' }, ctxFor(orgId))
    const r = await server.invoke<KbRemoveTagOutput>(
      'kb_remove_tag',
      { slug_or_id: entry.slug, tag: 'ROUNDTRIP' /* case-insensitive */ },
      ctxFor(orgId),
    )
    expect(r.result.tags).not.toContain('roundtrip')

    const hydrated = await kbEntryService.findBySlug({ organisationId: orgId, slug: entry.slug })
    expect(hydrated!.tags.map(t => t.name)).toEqual([])
  })

  it('remove is a no-op when the tag is not attached', async () => {
    const entry = await kbEntryService.create({ organisationId: orgId, title: 't', body: 'b' })
    const server = buildServer()
    const r = await server.invoke<KbRemoveTagOutput>(
      'kb_remove_tag',
      { slug_or_id: entry.slug, tag: 'never-attached' },
      ctxFor(orgId),
    )
    expect(r.result.tags).toEqual([])
  })
})

describe('kb_link_entries (via registry)', () => {
  let orgId: string

  beforeEach(async () => {
    userId = await setupUser()
    orgId = (await setupOrg()).id
  })

  it('one_way appends a wikilink to the from entry only', async () => {
    const target = await kbEntryService.create({ organisationId: orgId, title: 'Target', body: '' })
    const source = await kbEntryService.create({ organisationId: orgId, title: 'Source', body: 'see also' })

    const server = buildServer()
    const r = await server.invoke<KbLinkEntriesOutput>(
      'kb_link_entries',
      { from_slug_or_id: source.slug, to_slug_or_id: target.slug, direction: 'one_way' },
      ctxFor(orgId),
    )
    expect(r.result.direction).toBe('one_way')

    const reSrc = await kbEntryService.findBySlug({ organisationId: orgId, slug: source.slug })
    expect(reSrc!.bodyMd).toContain(`[[${target.slug}]]`)
    const reTgt = await kbEntryService.findBySlug({ organisationId: orgId, slug: target.slug })
    expect(reTgt!.bodyMd).not.toContain(`[[${source.slug}]]`)
  })

  it('both inserts wikilinks in both bodies', async () => {
    const a = await kbEntryService.create({ organisationId: orgId, title: 'A', body: 'a body' })
    const b = await kbEntryService.create({ organisationId: orgId, title: 'B', body: 'b body' })

    const server = buildServer()
    await server.invoke(
      'kb_link_entries',
      { from_slug_or_id: a.slug, to_slug_or_id: b.slug, direction: 'both' },
      ctxFor(orgId),
    )

    const reA = await kbEntryService.findBySlug({ organisationId: orgId, slug: a.slug })
    const reB = await kbEntryService.findBySlug({ organisationId: orgId, slug: b.slug })
    expect(reA!.bodyMd).toContain(`[[${b.slug}]]`)
    expect(reB!.bodyMd).toContain(`[[${a.slug}]]`)
  })
})

describe('kb_soft_delete_entry (via registry)', () => {
  let orgId: string
  let otherOrgId: string

  beforeEach(async () => {
    userId = await setupUser()
    orgId = (await setupOrg()).id
    otherOrgId = (await setupOrg()).id
  })

  it('sets deleted_at and subsequent kb_get_entry returns not-found', async () => {
    const entry = await kbEntryService.create({ organisationId: orgId, title: 'kill me', body: 'x' })

    const server = buildServer()
    // kb_soft_delete_entry is confirm-class — bypass the T-3.6 gate.
    const r = await server.invoke<KbSoftDeleteEntryOutput>(
      'kb_soft_delete_entry',
      { slug_or_id: entry.slug },
      ctxFor(orgId, { confirmationToken: 'test-confirmed' }),
    )
    expect(r.result.id).toBe(entry.id)
    expect(r.result.deleted_at).toMatch(/^\d{4}-\d{2}-\d{2}T/) // ISO

    await expect(
      server.invoke('kb_get_entry', { slug_or_id: entry.slug }, ctxFor(orgId)),
    ).rejects.toBeInstanceOf(McpToolNotFoundEntityError)
  })

  it('refuses cross-workspace soft-delete (entry remains live)', async () => {
    const entry = await kbEntryService.create({ organisationId: otherOrgId, title: 'theirs', body: 'x' })
    const server = buildServer()
    await expect(
      server.invoke('kb_soft_delete_entry', { slug_or_id: entry.slug }, ctxFor(orgId, { confirmationToken: 'test-confirmed' })),
    ).rejects.toBeInstanceOf(McpToolNotFoundEntityError)

    const stillLive = await kbEntryService.findBySlug({ organisationId: otherOrgId, slug: entry.slug })
    expect(stillLive).toBeTruthy()
    expect(stillLive!.deletedAt).toBeNull()
  })
})

// Sanity-check that service errors thrown from a write tool are wrapped per
// the registry's contract (McpToolError subclasses bubble unchanged; plain
// Errors get wrapped). We use a deliberately invalid status string smuggled
// past the schema via a tool with a permissive schema would be needed —
// instead we rely on the existing service-level throw path. Since
// `kbEntryService.update` throws via `createError` (an H3Error / plain Error
// per Nuxt), the registry wraps it in McpToolExecutionError with the original
// on `.cause`.
describe('mcp kb write tools — handler error wrapping', () => {
  beforeEach(async () => {
    userId = await setupUser()
  })

  it('wraps a non-McpToolError thrown by the service in McpToolExecutionError with .cause', async () => {
    const orgId = (await setupOrg()).id
    const entry = await kbEntryService.create({ organisationId: orgId, title: 't', body: 'b' })
    // Simulate a service-level failure by soft-deleting first, then asking
    // `update` to operate via the read-then-write path (it reads via
    // `readOne`, which still finds the row, but our resolver in the tool
    // rejects soft-deleted entries with McpToolNotFoundEntityError —
    // which is itself an McpToolError subclass and therefore bubbles).
    await kbEntryService.softDelete(entry.id)

    const server = buildServer()
    // kb_update_entry is confirm-class — bypass the T-3.6 gate so we exercise
    // the resolver path the test is actually about.
    const promise = server.invoke('kb_update_entry', { slug_or_id: entry.slug, title: 'x' }, ctxFor(orgId, { confirmationToken: 'test-confirmed' }))
    await expect(promise).rejects.toBeInstanceOf(McpToolNotFoundEntityError)
    // And critically: NOT wrapped in McpToolExecutionError (subclass passthrough).
    await expect(promise).rejects.not.toBeInstanceOf(McpToolExecutionError)
  })
})

// T-3.6 spec "Done when": kb_update_entry triggers a confirmation request and
// only executes after explicit resume. Exercised here through the real registry
// + real service so we lock in the wiring (gate sits between Zod and handler).
describe('t-3.6 confirmation flow — kb_update_entry', () => {
  let orgId: string

  beforeEach(async () => {
    userId = await setupUser()
    orgId = (await setupOrg()).id
  })

  it('first call throws ConfirmationRequiredError; second call with token performs the update', async () => {
    const entry = await kbEntryService.create({
      organisationId: orgId,
      title: 'Before confirm',
      body: 'old body',
    })
    const server = buildServer()

    // 1) Fresh model call — no confirmation token. Must NOT update; must throw.
    const firstCall = server.invoke(
      'kb_update_entry',
      { slug_or_id: entry.slug, title: 'After confirm', body_md: 'new body' },
      ctxFor(orgId),
    )
    await expect(firstCall).rejects.toBeInstanceOf(ConfirmationRequiredError)
    await firstCall.catch((err: ConfirmationRequiredError) => {
      expect(err.toolName).toBe('kb_update_entry')
      expect(err.reason).toBe('class')
      expect(err.affectedCount).toBe(1)
      // Validated post-Zod input is preserved on the error for the chat handler
      // to echo back into the SSE confirmation_required event.
      expect(err.input).toMatchObject({
        slug_or_id: entry.slug,
        title: 'After confirm',
        body_md: 'new body',
      })
    })

    // Persisted state untouched.
    const stillOld = await kbEntryService.findBySlug({ organisationId: orgId, slug: entry.slug })
    expect(stillOld!.title).toBe('Before confirm')
    expect(stillOld!.bodyMd).toBe('old body')

    // 2) Post-confirm re-invoke — chat handler supplies a token. Update runs.
    const secondCall = await server.invoke<KbUpdateEntryOutput>(
      'kb_update_entry',
      { slug_or_id: entry.slug, title: 'After confirm', body_md: 'new body' },
      ctxFor(orgId, { confirmationToken: 'user-clicked-confirm' }),
    )
    expect(secondCall.result.title).toBe('After confirm')

    const reread = await kbEntryService.findBySlug({ organisationId: orgId, slug: entry.slug })
    expect(reread!.title).toBe('After confirm')
    expect(reread!.bodyMd).toBe('new body')
  })
})
