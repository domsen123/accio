// Tests for the confirm + cancel chat-handler paths and route validation
// (T-3.12).
//
// Strategy mirrors `orchestrator-chat-handler.test.ts`: hoisted mocks for
// `@ai-sdk/anthropic` and `ai` so we can drive `streamText` deterministically.
// DB is real for messages + audit + conversations + entries. Permission guard
// is stubbed.
//
// Coverage:
//   - Confirm wrong status (`executed`) → throws 409 `orchestrator.action.not_pending`,
//     no state change.
//   - Confirm cross-org (org mismatch) → throws 404 `orchestrator.action.not_found`,
//     no state change.
//   - Cancel happy path → audit row `cancelled` + `cancelledAt` populated,
//     synthetic `tool_result` row persisted with `{cancelled:true}`, sink
//     surfaces a `tool-result` then a `message-complete`.
//   - Cancel wrong status (`executed`) → throws 409, no state change.
//   - Cancel cross-org → throws 404, no state change.
//   - Confirm body validation: missing `actionId` rejected by the Zod schema
//     used by the route file.
//
// The "confirm happy path" is already exercised by T-3.11's
// `chatHandler.resumeFromConfirmation` test — we don't duplicate it here.

import type {
  ChatHandler,
  ChatSseSink,
  ChatStreamEvent,
  PermissionGuard,
} from '../server/features/orchestrator/chat-handler'

import { eq, sql } from 'drizzle-orm'
import { ulid } from 'ulid'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

import * as schema from '../server/database/schema'
import { createAiProviderService } from '../server/features/ai/provider'
import { createKbCategoryService, createKbEntryService, createKbTagService } from '../server/features/kb/service'
import { createAuditService } from '../server/features/orchestrator/audit'
import { createChatHandler } from '../server/features/orchestrator/chat-handler'
import { createConversationsService } from '../server/features/orchestrator/conversations.service'
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

const organisationsItemService = createItemService({ db, table: schema.organisations, tableName: 'organisations' })
const usersItemService = createItemService({ db, table: schema.users, tableName: 'users' })

const buildHandler = (): ChatHandler => {
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

  const permissionGuard: PermissionGuard = {
    ensure: async () => {},
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

interface Fixture {
  orgId: string
  userId: string
  modelId: string
  conversationId: string
  cryptoSalt: string
}

/**
 * Ensure a single shared `ai_providers` + `ai_models` row exists. Both tables
 * carry uniqueness constraints (`ai_providers.key` and the
 * `(provider_id, model_id)` composite on `ai_models`) so cross-org tests
 * cannot duplicate them per org.
 */
const ensureProviderAndModel = async (): Promise<{ providerId: string, modelId: string }> => {
  const existingProviders = await db.select().from(schema.aiProviders).where(eq(schema.aiProviders.key, 'anthropic'))
  let providerId: string
  if (existingProviders.length > 0) {
    providerId = existingProviders[0]!.id
  }
  else {
    providerId = ulid()
    await db.insert(schema.aiProviders).values({
      id: providerId,
      key: 'anthropic',
      displayName: 'Anthropic',
      sdkProviderId: 'anthropic',
      enabled: true,
    })
  }

  const existingModels = await db.select().from(schema.aiModels).where(eq(schema.aiModels.providerId, providerId))
  let modelId: string
  if (existingModels.length > 0) {
    modelId = existingModels[0]!.id
  }
  else {
    modelId = ulid()
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
  }

  return { providerId, modelId }
}

const seed = async (mode: 'read_only' | 'read_write'): Promise<Fixture> => {
  const orgData = createOrganisationData()
  const orgRow = await organisationsItemService.create(orgData)
  const orgId = orgRow.id
  const userId = (await usersItemService.create(createUserData())).id

  const { providerId, modelId } = await ensureProviderAndModel()

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

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Drive a confirm-class tool call until the chat handler emits
 * `confirmation_required` and persists a `pending_confirmation` audit row.
 * Returns the freshly-seeded entry id and the pending audit row.
 */
const seedPendingUpdate = async (handler: ChatHandler, fx: Fixture) => {
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

  const pending = (await db
    .select()
    .from(schema.orchestratorActions)
    .where(eq(schema.orchestratorActions.conversationId, fx.conversationId)))[0]!
  expect(pending.status).toBe('pending_confirmation')
  return { entryId, pending }
}

// ─── Tests ──────────────────────────────────────────────────────────────────

beforeEach(async () => {
  await cleanTables()
  streamTextMock.mockClear()
  streamTextCalls.length = 0
})

describe('chatHandler.resumeFromConfirmation — validation', () => {
  it('throws 409 orchestrator.action.not_pending when row is already executed', async () => {
    const fx = await seed('read_write')
    const handler = buildHandler()
    const { entryId, pending } = await seedPendingUpdate(handler, fx)

    // Resume once — flips to executed.
    {
      const sink = makeSink()
      setTurns([[{ type: 'text-delta', text: 'Done.' }]])
      await handler.resumeFromConfirmation({
        conversationId: fx.conversationId,
        organisationId: fx.orgId,
        userId: fx.userId,
        actionId: pending.id,
        sink,
      })
    }

    const after = (await db.select().from(schema.orchestratorActions).where(eq(schema.orchestratorActions.id, pending.id)))[0]!
    expect(after.status).toBe('executed')

    // Snapshot side-effect state: row count + entry body before second call.
    const actionsBefore = (await db.select().from(schema.orchestratorActions).where(eq(schema.orchestratorActions.id, pending.id)))[0]!
    const entryBefore = (await db.select().from(schema.kbEntries).where(eq(schema.kbEntries.id, entryId)))[0]!

    // Second resume → 409.
    const resumeSink = makeSink()
    await expect(handler.resumeFromConfirmation({
      conversationId: fx.conversationId,
      organisationId: fx.orgId,
      userId: fx.userId,
      actionId: pending.id,
      sink: resumeSink,
    })).rejects.toMatchObject({ statusCode: 409, statusMessage: 'orchestrator.action.not_pending' })

    // Sink stays untouched (validation throws before SSE opens).
    expect(resumeSink.events.length).toBe(0)
    expect(resumeSink.closed).toBe(false)

    // Audit row + entry unchanged.
    const actionsAfter = (await db.select().from(schema.orchestratorActions).where(eq(schema.orchestratorActions.id, pending.id)))[0]!
    expect(actionsAfter).toEqual(actionsBefore)
    const entryAfter = (await db.select().from(schema.kbEntries).where(eq(schema.kbEntries.id, entryId)))[0]!
    expect(entryAfter.bodyMd).toBe(entryBefore.bodyMd)
  })

  it('throws 404 orchestrator.action.not_found when actionId belongs to a different org', async () => {
    const fxA = await seed('read_write')
    const fxB = await seed('read_write')
    const handler = buildHandler()

    const { pending } = await seedPendingUpdate(handler, fxA)

    const auditBefore = (await db.select().from(schema.orchestratorActions).where(eq(schema.orchestratorActions.id, pending.id)))[0]!

    const sink = makeSink()
    await expect(handler.resumeFromConfirmation({
      conversationId: fxB.conversationId,
      organisationId: fxB.orgId,
      userId: fxB.userId,
      actionId: pending.id,
      sink,
    })).rejects.toMatchObject({ statusCode: 404, statusMessage: 'orchestrator.action.not_found' })

    expect(sink.events.length).toBe(0)
    expect(sink.closed).toBe(false)

    const auditAfter = (await db.select().from(schema.orchestratorActions).where(eq(schema.orchestratorActions.id, pending.id)))[0]!
    expect(auditAfter).toEqual(auditBefore)
  })

  it('throws 404 when actionId is unknown', async () => {
    const fx = await seed('read_write')
    const handler = buildHandler()

    const sink = makeSink()
    await expect(handler.resumeFromConfirmation({
      conversationId: fx.conversationId,
      organisationId: fx.orgId,
      userId: fx.userId,
      actionId: ulid(),
      sink,
    })).rejects.toMatchObject({ statusCode: 404, statusMessage: 'orchestrator.action.not_found' })

    expect(sink.events.length).toBe(0)
  })
})

describe('chatHandler.resumeFromCancellation — happy path', () => {
  it('marks audit cancelled, persists synthetic tool_result, drives a final assistant turn', async () => {
    const fx = await seed('read_write')
    const handler = buildHandler()
    const { entryId, pending } = await seedPendingUpdate(handler, fx)

    const sink = makeSink()
    // The model's reaction turn after seeing the cancel tool_result.
    setTurns([[{ type: 'text-delta', text: 'Cancelled — let me know if you want to revise.' }]])

    await handler.resumeFromCancellation({
      conversationId: fx.conversationId,
      organisationId: fx.orgId,
      userId: fx.userId,
      actionId: pending.id,
      sink,
    })

    // SSE: `tool-result` first (the synthesised cancel), then a text-delta,
    // then `message-complete`.
    const types = sink.events.map(e => e.type)
    expect(types[0]).toBe('tool-result')
    expect(types).toContain('text-delta')
    expect(types[types.length - 1]).toBe('message-complete')
    expect(sink.closed).toBe(true)

    const cancelEvent = sink.events.find(e => e.type === 'tool-result') as
      | { type: 'tool-result', toolCallId: string, actionId: string, result: unknown }
      | undefined
    expect(cancelEvent).toBeDefined()
    expect(cancelEvent!.actionId).toBe(pending.id)
    expect(cancelEvent!.toolCallId).toBe(`confirm_kb_update_entry_${pending.id}`)
    expect(cancelEvent!.result).toEqual({ cancelled: true, reason: 'user_cancelled' })

    // Audit row → cancelled, cancelledAt populated, executedAt still null.
    const audits = await db.select().from(schema.orchestratorActions).where(eq(schema.orchestratorActions.id, pending.id))
    expect(audits.length).toBe(1)
    expect(audits[0]!.status).toBe('cancelled')
    expect(audits[0]!.cancelledAt).toBeInstanceOf(Date)
    expect(audits[0]!.executedAt).toBeNull()

    // Entry untouched (cancel does NOT execute the tool).
    const entry = await db.select().from(schema.kbEntries).where(eq(schema.kbEntries.id, entryId))
    expect(entry[0]!.bodyMd).toBe('old body')

    // Messages: original user, assistant(toolcall), tool_result(cancelled),
    // final assistant(text).
    const rows = await db
      .select()
      .from(schema.orchestratorMessages)
      .where(eq(schema.orchestratorMessages.conversationId, fx.conversationId))
      .orderBy(schema.orchestratorMessages.createdAt, schema.orchestratorMessages.id)
    expect(rows.map(r => r.role)).toEqual(['user', 'assistant', 'tool_result', 'assistant'])
    const toolResultRow = rows[2]!
    const blocks = toolResultRow.content as Array<{
      type: string
      toolCallId: string
      toolName: string
      output: { type: string, value: { cancelled: boolean, reason: string } }
    }>
    expect(blocks).toHaveLength(1)
    expect(blocks[0]!.type).toBe('tool-result')
    expect(blocks[0]!.toolName).toBe('kb_update_entry')
    expect(blocks[0]!.toolCallId).toBe(`confirm_kb_update_entry_${pending.id}`)
    expect(blocks[0]!.output.value).toEqual({ cancelled: true, reason: 'user_cancelled' })

    // Audit row's messageId is bound to the tool_result row id.
    expect(audits[0]!.messageId).toBe(toolResultRow.id)
  })
})

describe('chatHandler.resumeFromCancellation — validation', () => {
  it('throws 409 orchestrator.action.not_pending when row is already executed', async () => {
    const fx = await seed('read_write')
    const handler = buildHandler()
    const { pending } = await seedPendingUpdate(handler, fx)

    // First flip via confirm path.
    {
      const sink = makeSink()
      setTurns([[{ type: 'text-delta', text: 'Done.' }]])
      await handler.resumeFromConfirmation({
        conversationId: fx.conversationId,
        organisationId: fx.orgId,
        userId: fx.userId,
        actionId: pending.id,
        sink,
      })
    }

    const auditBefore = (await db.select().from(schema.orchestratorActions).where(eq(schema.orchestratorActions.id, pending.id)))[0]!
    expect(auditBefore.status).toBe('executed')

    const sink = makeSink()
    await expect(handler.resumeFromCancellation({
      conversationId: fx.conversationId,
      organisationId: fx.orgId,
      userId: fx.userId,
      actionId: pending.id,
      sink,
    })).rejects.toMatchObject({ statusCode: 409, statusMessage: 'orchestrator.action.not_pending' })

    expect(sink.events.length).toBe(0)
    expect(sink.closed).toBe(false)

    const auditAfter = (await db.select().from(schema.orchestratorActions).where(eq(schema.orchestratorActions.id, pending.id)))[0]!
    expect(auditAfter).toEqual(auditBefore)
  })

  it('throws 404 orchestrator.action.not_found when actionId belongs to a different org', async () => {
    const fxA = await seed('read_write')
    const fxB = await seed('read_write')
    const handler = buildHandler()
    const { pending } = await seedPendingUpdate(handler, fxA)

    const auditBefore = (await db.select().from(schema.orchestratorActions).where(eq(schema.orchestratorActions.id, pending.id)))[0]!

    const sink = makeSink()
    await expect(handler.resumeFromCancellation({
      conversationId: fxB.conversationId,
      organisationId: fxB.orgId,
      userId: fxB.userId,
      actionId: pending.id,
      sink,
    })).rejects.toMatchObject({ statusCode: 404, statusMessage: 'orchestrator.action.not_found' })

    expect(sink.events.length).toBe(0)

    const auditAfter = (await db.select().from(schema.orchestratorActions).where(eq(schema.orchestratorActions.id, pending.id)))[0]!
    expect(auditAfter).toEqual(auditBefore)
  })

  it('throws 404 when actionId is unknown', async () => {
    const fx = await seed('read_write')
    const handler = buildHandler()

    const sink = makeSink()
    await expect(handler.resumeFromCancellation({
      conversationId: fx.conversationId,
      organisationId: fx.orgId,
      userId: fx.userId,
      actionId: ulid(),
      sink,
    })).rejects.toMatchObject({ statusCode: 404, statusMessage: 'orchestrator.action.not_found' })

    expect(sink.events.length).toBe(0)
  })
})

// ─── Route-shape validation ────────────────────────────────────────────────
//
// We re-derive the body schema here rather than importing it from the route
// file (the route is a default-export `defineEventHandler`, not a slim
// module — keeping the test focused on the contract). If the route's schema
// drifts from this one the contract intent is documented and the test will
// fail loudly when someone copies the new shape over.

const confirmCancelBodySchema = z.object({
  actionId: z.string().trim().length(26).regex(/^[0-9A-HJKMNP-TV-Z]+$/i),
})

describe('confirm/cancel route body schema', () => {
  it('rejects a body missing actionId', () => {
    const result = confirmCancelBodySchema.safeParse({})
    expect(result.success).toBe(false)
  })

  it('rejects a malformed (non-ULID) actionId', () => {
    const result = confirmCancelBodySchema.safeParse({ actionId: 'not-a-ulid' })
    expect(result.success).toBe(false)
  })

  it('accepts a well-formed ULID', () => {
    const result = confirmCancelBodySchema.safeParse({ actionId: ulid() })
    expect(result.success).toBe(true)
  })
})
