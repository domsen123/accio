// Tests for the orchestrator chat handler (T-3.11).
//
// Strategy: hoisted mocks for `@ai-sdk/anthropic` and `ai` so we can drive
// `streamText` deterministically. DB is real for messages + audit +
// conversations. Permission guard is stubbed (the handler accepts a
// PermissionGuard interface — tests inject a permissive or refusing one).
//
// Coverage:
//   - Single text-only turn: user/assistant message persistence + SSE events.
//   - Auto tool turn: tool-call drives kb_list_tags, recurses to text turn.
//   - Confirm tool turn: kb_update_entry → confirmation_required, ends loop.
//   - Resume: pre-create pending row + assistant message, run
//     resumeFromConfirmation, verify `executed` audit + tool_result + final
//     model turn.
//   - Permission gate: read_write without ORCHESTRATOR_WRITE → throws.
//   - Cross-org conversation id: 404 (OrchestratorConversationNotFoundError).

import type {
  ChatHandler,
  ChatSseSink,
  ChatStreamEvent,
  PermissionGuard,
} from '../server/features/orchestrator/chat-handler'

import { eq, sql } from 'drizzle-orm'
import { ulid } from 'ulid'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import * as schema from '../server/database/schema'
import { createAiProviderService } from '../server/features/ai/provider'
import { createKbCategoryService, createKbEntryService, createKbTagService } from '../server/features/kb/service'
import { createAuditService } from '../server/features/orchestrator/audit'
import { createChatHandler } from '../server/features/orchestrator/chat-handler'
import { createConversationsService } from '../server/features/orchestrator/conversations.service'
import { OrchestratorConversationNotFoundError } from '../server/features/orchestrator/errors'
import { createMessagesService } from '../server/features/orchestrator/messages.service'
import { createTodoService } from '../server/features/todo/service'
import { getDatabase } from '../server/infrastructure/database/client'
import { createItemService } from '../server/infrastructure/database/item-service'
import { encryptForOrg } from '../server/utils/crypto'

import { createOrganisationData, createUserData } from './factories'

// ─── Hoisted SDK mocks ──────────────────────────────────────────────────────

const mocks = vi.hoisted(() => {
  const anthropicCallable = vi.fn((modelId: string) => ({ provider: 'anthropic', modelId }))
  const createAnthropicMock = vi.fn(() => anthropicCallable)

  // Per-call queue: each call to `streamText` drains one item from the queue
  // and yields its chunks. Tests push as many turns as the loop will execute.
  let chunkQueue: unknown[][] = []
  const streamTextCalls: Array<Record<string, unknown>> = []
  const streamTextMock = vi.fn((opts: Record<string, unknown>) => {
    streamTextCalls.push(opts)
    const chunks = chunkQueue.shift() ?? []
    return {
      fullStream: (async function* () {
        for (const c of chunks) yield c
      })(),
    }
  })

  return {
    anthropicCallable,
    createAnthropicMock,
    streamTextMock,
    streamTextCalls,
    setTurns: (turns: unknown[][]) => { chunkQueue = turns.slice() },
  }
})

vi.mock('@ai-sdk/anthropic', () => ({
  createAnthropic: (opts: { apiKey: string }) => mocks.createAnthropicMock(opts),
}))
vi.mock('@ai-sdk/openai', () => ({ createOpenAI: () => () => ({ provider: 'openai' }) }))
vi.mock('@ai-sdk/google', () => ({ createGoogleGenerativeAI: () => () => ({ provider: 'google' }) }))
vi.mock('ai', () => ({
  streamText: (opts: Record<string, unknown>) => mocks.streamTextMock(opts),
}))

const { setTurns, streamTextCalls, streamTextMock } = mocks

// ─── DB plumbing ────────────────────────────────────────────────────────────

const db = getDatabase('app')

const cleanTables = async () => {
  await db.execute(sql`TRUNCATE TABLE
    orchestrator_actions,
    orchestrator_messages,
    orchestrator_conversations,
    orchestrator_workspace_settings,
    ai_provider_credentials,
    ai_models,
    ai_providers,
    todo_kb_links,
    todo_tags,
    todos,
    kb_entry_tags,
    kb_entries,
    kb_categories,
    kb_tags
    CASCADE`)
}

// ─── Service wiring ─────────────────────────────────────────────────────────

const organisationsItemService = createItemService({ db, table: schema.organisations, tableName: 'organisations' })
const usersItemService = createItemService({ db, table: schema.users, tableName: 'users' })

const buildHandler = (overrides: { allowWrite?: boolean } = {}): ChatHandler => {
  const aiProviderService = createAiProviderService({ db })
  const conversationsService = createConversationsService({ db })
  const auditService = createAuditService({ db })
  const messagesService = createMessagesService({ db })

  const kbEntriesItemService = createItemService({ db, table: schema.kbEntries, tableName: 'kbEntries' })
  const kbCategoriesItemService = createItemService({ db, table: schema.kbCategories, tableName: 'kbCategories' })
  const kbTagsItemService = createItemService({ db, table: schema.kbTags, tableName: 'kbTags' })
  const todosItemService = createItemService({ db, table: schema.todos, tableName: 'todos' })

  const kbCategoryService = createKbCategoryService({ kbCategoriesItemService })
  const kbTagService = createKbTagService({ db, kbTagsItemService })
  const kbEntryService = createKbEntryService({ db, kbEntriesItemService, kbTagService })
  const todoService = createTodoService({ db, todosItemService, kbTagService })

  const allowWrite = overrides.allowWrite ?? true
  const permissionGuard: PermissionGuard = {
    ensure: async (gate) => {
      if (gate.permission === 'orchestrator:write' && !allowWrite) {
        throw Object.assign(new Error('forbidden'), { statusCode: 403 })
      }
    },
  }

  return createChatHandler({
    conversationsService,
    messagesService,
    auditService,
    aiProviderService,
    kbEntryService,
    kbCategoryService,
    kbTagService,
    todoService,
    db,
    permissionGuard,
    maxLoopIterations: 4,
  })
}

// ─── Fixtures ───────────────────────────────────────────────────────────────

interface Fixture {
  orgId: string
  userId: string
  modelId: string
  conversationId: string
  cryptoSalt: string
}

const seed = async (mode: 'read_only' | 'read_write'): Promise<Fixture> => {
  const orgData = createOrganisationData()
  const orgRow = await organisationsItemService.create(orgData)
  const orgId = orgRow.id
  const userId = (await usersItemService.create(createUserData())).id

  const providerId = ulid()
  await db.insert(schema.aiProviders).values({
    id: providerId,
    key: 'anthropic',
    displayName: 'Anthropic',
    sdkProviderId: 'anthropic',
    enabled: true,
  })

  const modelId = ulid()
  await db.insert(schema.aiModels).values({
    id: modelId,
    providerId,
    modelId: 'claude-sonnet-4-6',
    displayName: 'Claude Sonnet 4.6',
    contextWindow: 1_000_000,
    supportsTools: true,
    supportsStreaming: true,
    enabled: true,
    isDefault: true,
  })

  await db.insert(schema.aiProviderCredentials).values({
    id: ulid(),
    organisationId: orgId,
    providerId,
    apiKeyEncrypted: encryptForOrg('sk-test-fixture-key', orgRow.cryptoSalt),
  })

  const conversationId = ulid()
  await db.insert(schema.orchestratorConversations).values({
    id: conversationId,
    organisationId: orgId,
    userId,
    title: 'fixture',
    mode,
    modelId,
  })

  return { orgId, userId, modelId, conversationId, cryptoSalt: orgRow.cryptoSalt }
}

// ─── Sink helper ────────────────────────────────────────────────────────────

interface CapturedSink extends ChatSseSink {
  events: ChatStreamEvent[]
  closed: boolean
}

const makeSink = (): CapturedSink => {
  const events: ChatStreamEvent[] = []
  let closed = false
  return {
    events,
    get closed() { return closed },
    set closed(v) { closed = v },
    send: async (event) => { events.push(event) },
    close: async () => { closed = true },
  }
}

// ─── Tests ──────────────────────────────────────────────────────────────────

beforeEach(async () => {
  await cleanTables()
  streamTextMock.mockClear()
  streamTextCalls.length = 0
})

describe('chatHandler.run — text-only turn', () => {
  it('persists user + assistant messages, streams deltas, completes', async () => {
    const fx = await seed('read_only')
    const handler = buildHandler()
    const sink = makeSink()

    setTurns([[
      { type: 'text-delta', text: 'Hello ' },
      { type: 'text-delta', text: 'world' },
    ]])

    await handler.run({
      conversationId: fx.conversationId,
      organisationId: fx.orgId,
      userId: fx.userId,
      userText: 'Hi',
      sink,
    })

    // SSE events: 2 deltas + message-complete.
    const types = sink.events.map(e => e.type)
    expect(types).toEqual(['text-delta', 'text-delta', 'message-complete'])
    expect(sink.closed).toBe(true)

    // DB: 1 user, 1 assistant.
    const rows = await db.select().from(schema.orchestratorMessages).where(eq(schema.orchestratorMessages.conversationId, fx.conversationId)).orderBy(schema.orchestratorMessages.createdAt)
    expect(rows.length).toBe(2)
    expect(rows[0]!.role).toBe('user')
    expect(rows[0]!.content).toBe('Hi')
    expect(rows[1]!.role).toBe('assistant')
    expect(Array.isArray(rows[1]!.content)).toBe(true)
    const blocks = rows[1]!.content as Array<{ type: string, text?: string }>
    expect(blocks).toEqual([{ type: 'text', text: 'Hello world' }])
  })
})

describe('chatHandler.run — auto tool turn', () => {
  it('runs kb_list_tags, persists tool_result, recurses to final text turn', async () => {
    const fx = await seed('read_only')
    const handler = buildHandler()
    const sink = makeSink()

    // Pre-seed a tag so kb_list_tags returns something.
    const tagId = ulid()
    await db.insert(schema.kbTags).values({ id: tagId, organisationId: fx.orgId, name: 'rust' })

    // Turn 1: assistant emits a tool-call. Turn 2: assistant emits text only.
    setTurns([
      [{ type: 'tool-call', toolCallId: 'call-1', toolName: 'kb_list_tags', input: {} }],
      [{ type: 'text-delta', text: 'Found 1 tag.' }],
    ])

    await handler.run({
      conversationId: fx.conversationId,
      organisationId: fx.orgId,
      userId: fx.userId,
      userText: 'list tags',
      sink,
    })

    const types = sink.events.map(e => e.type)
    expect(types).toContain('tool-call')
    expect(types).toContain('tool-result')
    expect(types).toContain('text-delta')
    expect(types[types.length - 1]).toBe('message-complete')

    // DB rows: user, assistant(toolcall), tool_result, assistant(text).
    const rows = await db.select().from(schema.orchestratorMessages).where(eq(schema.orchestratorMessages.conversationId, fx.conversationId)).orderBy(schema.orchestratorMessages.createdAt, schema.orchestratorMessages.id)
    expect(rows.map(r => r.role)).toEqual(['user', 'assistant', 'tool_result', 'assistant'])

    // Read tool — no audit row.
    const audits = await db.select().from(schema.orchestratorActions).where(eq(schema.orchestratorActions.conversationId, fx.conversationId))
    expect(audits.length).toBe(0)
  })
})

describe('chatHandler.run — confirm tool turn', () => {
  it('emits confirmation_required and ends without executing', async () => {
    const fx = await seed('read_write')
    const handler = buildHandler()
    const sink = makeSink()

    // Seed a KB entry the model will try to update.
    const entryId = ulid()
    await db.insert(schema.kbEntries).values({
      id: entryId,
      organisationId: fx.orgId,
      title: 'Existing',
      slug: 'existing',
      bodyMd: 'old body',
      status: 'verified',
      authorType: 'human',
      sourceType: 'manual',
    })

    setTurns([[
      {
        type: 'tool-call',
        toolCallId: 'call-1',
        toolName: 'kb_update_entry',
        input: { slug_or_id: 'existing', body_md: 'new body' },
      },
    ]])

    await handler.run({
      conversationId: fx.conversationId,
      organisationId: fx.orgId,
      userId: fx.userId,
      userText: 'update existing',
      sink,
    })

    const types = sink.events.map(e => e.type)
    expect(types).toContain('confirmation_required')
    // No tool-result was emitted.
    expect(types).not.toContain('tool-result')
    // No further model turns ran.
    expect(streamTextCalls.length).toBe(1)

    // Audit row in pending_confirmation, attributed to the conversation's pinned model.
    const audits = await db.select().from(schema.orchestratorActions).where(eq(schema.orchestratorActions.conversationId, fx.conversationId))
    expect(audits.length).toBe(1)
    expect(audits[0]!.status).toBe('pending_confirmation')
    expect(audits[0]!.toolName).toBe('kb_update_entry')
    expect(audits[0]!.modelId).toBe(fx.modelId)

    // Entry untouched.
    const entry = await db.select().from(schema.kbEntries).where(eq(schema.kbEntries.id, entryId))
    expect(entry[0]!.bodyMd).toBe('old body')

    // Messages: user + assistant(toolcall). No tool_result.
    const rows = await db.select().from(schema.orchestratorMessages).where(eq(schema.orchestratorMessages.conversationId, fx.conversationId))
    expect(rows.map(r => r.role)).toEqual(['user', 'assistant'])
  })
})

describe('chatHandler.resumeFromConfirmation', () => {
  it('re-invokes pending action, persists tool_result + executed audit, drives final turn', async () => {
    const fx = await seed('read_write')
    const handler = buildHandler()

    // Seed a KB entry.
    const entryId = ulid()
    await db.insert(schema.kbEntries).values({
      id: entryId,
      organisationId: fx.orgId,
      title: 'Existing',
      slug: 'existing',
      bodyMd: 'old body',
      status: 'verified',
      authorType: 'human',
      sourceType: 'manual',
    })

    // Step 1: drive a confirmation flow to create a pending row.
    {
      const sink = makeSink()
      setTurns([[
        {
          type: 'tool-call',
          toolCallId: 'call-1',
          toolName: 'kb_update_entry',
          input: { slug_or_id: 'existing', body_md: 'new body' },
        },
      ]])
      await handler.run({
        conversationId: fx.conversationId,
        organisationId: fx.orgId,
        userId: fx.userId,
        userText: 'update',
        sink,
      })
    }

    const pending = (await db.select().from(schema.orchestratorActions).where(eq(schema.orchestratorActions.conversationId, fx.conversationId)))[0]!
    expect(pending.status).toBe('pending_confirmation')

    // Step 2: resume.
    const resumeSink = makeSink()
    setTurns([[
      { type: 'text-delta', text: 'Updated.' },
    ]])

    await handler.resumeFromConfirmation({
      conversationId: fx.conversationId,
      organisationId: fx.orgId,
      userId: fx.userId,
      actionId: pending.id,
      sink: resumeSink,
    })

    const types = resumeSink.events.map(e => e.type)
    expect(types[0]).toBe('tool-result')
    expect(types).toContain('text-delta')
    expect(types[types.length - 1]).toBe('message-complete')

    // Audit row patched to executed (single row total), still attributed to the same model.
    const audits = await db.select().from(schema.orchestratorActions).where(eq(schema.orchestratorActions.conversationId, fx.conversationId))
    expect(audits.length).toBe(1)
    expect(audits[0]!.status).toBe('executed')
    expect(audits[0]!.id).toBe(pending.id)
    expect(audits[0]!.modelId).toBe(fx.modelId)

    // Entry now updated.
    const entry = await db.select().from(schema.kbEntries).where(eq(schema.kbEntries.id, entryId))
    expect(entry[0]!.bodyMd).toBe('new body')

    // Messages: original user, assistant(toolcall), tool_result, final assistant.
    const rows = await db.select().from(schema.orchestratorMessages).where(eq(schema.orchestratorMessages.conversationId, fx.conversationId)).orderBy(schema.orchestratorMessages.createdAt, schema.orchestratorMessages.id)
    expect(rows.map(r => r.role)).toEqual(['user', 'assistant', 'tool_result', 'assistant'])
  })
})

describe('chatHandler.run — permission gate', () => {
  it('throws before any SSE event when read_write is denied', async () => {
    const fx = await seed('read_write')
    const handler = buildHandler({ allowWrite: false })
    const sink = makeSink()

    await expect(handler.run({
      conversationId: fx.conversationId,
      organisationId: fx.orgId,
      userId: fx.userId,
      userText: 'hi',
      sink,
    })).rejects.toMatchObject({ statusCode: 403 })

    // Sink stays empty: the permission failure happens before the loop opens.
    expect(sink.events.length).toBe(0)
    expect(sink.closed).toBe(false)
  })
})

describe('chatHandler.run — cross-org / unknown conversation', () => {
  it('throws OrchestratorConversationNotFoundError for a missing id', async () => {
    const fx = await seed('read_only')
    const handler = buildHandler()
    const sink = makeSink()

    await expect(handler.run({
      conversationId: ulid(),
      organisationId: fx.orgId,
      userId: fx.userId,
      userText: 'hi',
      sink,
    })).rejects.toBeInstanceOf(OrchestratorConversationNotFoundError)
  })
})
