// Tests for the orchestrator AI client (T-3.10).
//
// We hoist mocks for `@ai-sdk/anthropic` and `ai` so the AI SDK is replaced
// before the module under test imports anything.

import type { OrchestratorConversation } from '../server/database/schema'
import { sql } from 'drizzle-orm'
import { ulid } from 'ulid'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

import * as schema from '../server/database/schema'
import { createAiProviderService } from '../server/features/ai/provider'
import { createOrchestratorAiClient } from '../server/features/orchestrator/ai-client'
import { createConversationsService } from '../server/features/orchestrator/conversations.service'
import { OrchestratorConversationNotFoundError } from '../server/features/orchestrator/errors'
import { createMcpServer } from '../server/features/orchestrator/mcp-server'
import { getDatabase } from '../server/infrastructure/database/client'
import { encryptForOrg } from '../server/utils/crypto'

import { createOrganisationData } from './factories'

// ─── Hoisted SDK mocks ──────────────────────────────────────────────────────

const mocks = vi.hoisted(() => {
  const anthropicCallable = vi.fn((modelId: string) => ({ provider: 'anthropic', modelId }))
  const createAnthropicMock = vi.fn(() => anthropicCallable)

  // Each `streamText` invocation hands a fresh `fullStream` (an async iterable)
  // to the test. Tests push chunks into the next stream by setting
  // `streamTextChunks` before calling `streamChat`.
  let streamTextChunks: unknown[] = []
  const streamTextCalls: Array<Record<string, unknown>> = []
  const streamTextMock = vi.fn((opts: Record<string, unknown>) => {
    streamTextCalls.push(opts)
    const chunks = streamTextChunks.slice()
    return {
      fullStream: (async function* () {
        for (const chunk of chunks) {
          yield chunk
        }
      })(),
    }
  })

  return {
    anthropicCallable,
    createAnthropicMock,
    streamTextMock,
    streamTextCalls,
    setStreamTextChunks: (chunks: unknown[]) => { streamTextChunks = chunks },
  }
})

vi.mock('@ai-sdk/anthropic', () => ({
  createAnthropic: (opts: { apiKey: string }) => mocks.createAnthropicMock(opts),
}))
vi.mock('@ai-sdk/openai', () => ({
  createOpenAI: () => () => ({ provider: 'openai' }),
}))
vi.mock('@ai-sdk/google', () => ({
  createGoogleGenerativeAI: () => () => ({ provider: 'google' }),
}))

vi.mock('ai', () => ({
  streamText: (opts: Record<string, unknown>) => mocks.streamTextMock(opts),
}))

const { createAnthropicMock, anthropicCallable, streamTextMock, streamTextCalls, setStreamTextChunks } = mocks

// ─── Fixtures ────────────────────────────────────────────────────────────────

const db = getDatabase('app')
const aiProviderService = createAiProviderService({ db })
const conversationsService = createConversationsService({ db })

const cleanAiTables = async () => {
  await db.execute(sql`TRUNCATE TABLE
    orchestrator_actions,
    orchestrator_messages,
    orchestrator_conversations,
    ai_provider_credentials,
    orchestrator_workspace_settings,
    ai_models,
    ai_providers
    CASCADE`)
}

interface Fixture {
  orgId: string
  apiKey: string
  anthropicProviderId: string
  globalDefaultModelId: string
  haikuModelId: string
  conversationId: string
}

const setupFixture = async (
  opts: { conversationModelId?: string | null, mode?: 'read_only' | 'read_write' } = {},
): Promise<Fixture> => {
  const orgData = createOrganisationData()
  const orgId = ulid()
  await db.insert(schema.organisations).values({
    id: orgId,
    name: orgData.name,
    slug: `${orgData.slug}-${orgId.slice(-6).toLowerCase()}`,
    cryptoSalt: orgData.cryptoSalt,
  })

  const anthropicProviderId = ulid()
  await db.insert(schema.aiProviders).values({
    id: anthropicProviderId,
    key: 'anthropic',
    displayName: 'Anthropic',
    sdkProviderId: 'anthropic',
    enabled: true,
  })

  const sonnetId = ulid()
  const haikuId = ulid()
  await db.insert(schema.aiModels).values([
    {
      id: sonnetId,
      providerId: anthropicProviderId,
      modelId: 'claude-sonnet-4-6',
      displayName: 'Claude Sonnet 4.6',
      contextWindow: 1_000_000,
      supportsTools: true,
      supportsStreaming: true,
      enabled: true,
      isDefault: true,
    },
    {
      id: haikuId,
      providerId: anthropicProviderId,
      modelId: 'claude-haiku-4-5',
      displayName: 'Claude Haiku 4.5',
      contextWindow: 200_000,
      supportsTools: true,
      supportsStreaming: true,
      enabled: true,
    },
  ])

  const apiKey = 'sk-test-fixture-key-1234567890'
  await db.insert(schema.aiProviderCredentials).values({
    id: ulid(),
    organisationId: orgId,
    providerId: anthropicProviderId,
    apiKeyEncrypted: encryptForOrg(apiKey, orgData.cryptoSalt),
  })

  const conversationId = ulid()
  await db.insert(schema.orchestratorConversations).values({
    id: conversationId,
    organisationId: orgId,
    userId: null,
    title: 'fixture',
    mode: opts.mode ?? 'read_only',
    modelId: opts.conversationModelId === undefined ? null : opts.conversationModelId,
  })

  return {
    orgId,
    apiKey,
    anthropicProviderId,
    globalDefaultModelId: sonnetId,
    haikuModelId: haikuId,
    conversationId,
  }
}

// ─── Stub registry helpers ──────────────────────────────────────────────────

const buildServerWithTools = (mode: 'read' | 'write' | 'both') => {
  const server = createMcpServer()
  if (mode === 'read' || mode === 'both') {
    server.register({
      name: 'kb_search',
      description: 'search KB',
      schema: z.object({ q: z.string() }),
      class: 'auto',
      mode: 'read',
      handler: async () => ({ rows: [] }),
    })
  }
  if (mode === 'write' || mode === 'both') {
    server.register({
      name: 'kb_create_entry',
      description: 'create KB entry',
      schema: z.object({ title: z.string() }),
      class: 'auto',
      mode: 'write',
      handler: async () => ({ id: 'new' }),
    })
  }
  return server
}

// ─── resolveForConversation ─────────────────────────────────────────────────

describe('orchestratorAiClient.resolveForConversation', () => {
  beforeEach(async () => {
    await cleanAiTables()
    createAnthropicMock.mockClear()
    anthropicCallable.mockClear()
    streamTextMock.mockClear()
    streamTextCalls.length = 0
  })

  it('returns the resolved bundle when the conversation pins a model', async () => {
    const fx = await setupFixture({ conversationModelId: undefined })
    // Pin haiku on the conversation directly.
    await db.update(schema.orchestratorConversations)
      .set({ modelId: fx.haikuModelId })
      .where(sql`id = ${fx.conversationId}`)

    const client = createOrchestratorAiClient({
      aiProviderService,
      conversationsService,
      mcpServer: buildServerWithTools('both'),
    })
    const resolved = await client.resolveForConversation({
      conversationId: fx.conversationId,
      organisationId: fx.orgId,
    })

    expect(resolved.modelRow.id).toBe(fx.haikuModelId)
    expect(resolved.providerKey).toBe('anthropic')
    expect(resolved.modelClient).toEqual({ provider: 'anthropic', modelId: 'claude-haiku-4-5' })
    expect(anthropicCallable).toHaveBeenCalledWith('claude-haiku-4-5')
    // Default workspace settings -> ai_display_name = 'Claude-Orchestrator'.
    expect(resolved.authorName).toBe('Claude-Orchestrator')
    expect(resolved.conversation.id).toBe(fx.conversationId)
  })

  it('falls back to the workspace default model when the conversation has none', async () => {
    const fx = await setupFixture()
    // Workspace pins haiku as the default.
    await db.insert(schema.orchestratorWorkspaceSettings).values({
      organisationId: fx.orgId,
      defaultModelId: fx.haikuModelId,
      aiDisplayName: 'Custom Bot',
    })

    const client = createOrchestratorAiClient({
      aiProviderService,
      conversationsService,
      mcpServer: buildServerWithTools('both'),
    })
    const resolved = await client.resolveForConversation({
      conversationId: fx.conversationId,
      organisationId: fx.orgId,
    })

    expect(resolved.modelRow.id).toBe(fx.haikuModelId)
    expect(resolved.authorName).toBe('Custom Bot')
  })

  it('falls back to the global default when both conversation and workspace are unset', async () => {
    const fx = await setupFixture()
    const client = createOrchestratorAiClient({
      aiProviderService,
      conversationsService,
      mcpServer: buildServerWithTools('both'),
    })

    const resolved = await client.resolveForConversation({
      conversationId: fx.conversationId,
      organisationId: fx.orgId,
    })

    expect(resolved.modelRow.id).toBe(fx.globalDefaultModelId)
    expect(resolved.modelRow.modelId).toBe('claude-sonnet-4-6')
  })

  it('throws OrchestratorConversationNotFoundError for an unknown conversation id', async () => {
    const fx = await setupFixture()
    const client = createOrchestratorAiClient({
      aiProviderService,
      conversationsService,
      mcpServer: buildServerWithTools('both'),
    })

    await expect(client.resolveForConversation({
      conversationId: ulid(),
      organisationId: fx.orgId,
    })).rejects.toBeInstanceOf(OrchestratorConversationNotFoundError)
  })
})

// ─── streamChat ─────────────────────────────────────────────────────────────

const buildFakeConversation = (overrides: Partial<OrchestratorConversation> = {}): OrchestratorConversation => ({
  id: 'conv-1',
  organisationId: 'org-1',
  userId: null,
  title: 'fake',
  mode: 'read_only',
  modelId: null,
  systemPrompt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  deletedAt: null,
  ...overrides,
})

const fakeModel = { provider: 'anthropic', modelId: 'fake' } as never

describe('orchestratorAiClient.streamChat', () => {
  beforeEach(() => {
    streamTextMock.mockClear()
    streamTextCalls.length = 0
    setStreamTextChunks([])
  })

  it('exposes only read tools when the conversation is read_only', () => {
    const server = buildServerWithTools('both')
    const client = createOrchestratorAiClient({
      aiProviderService,
      conversationsService,
      mcpServer: server,
    })

    const { toolsRegistered } = client.streamChat({
      conversation: buildFakeConversation({ mode: 'read_only' }),
      modelClient: fakeModel,
      messages: [],
      toolContext: { organisationId: 'org-1', userId: 'u-1', mode: 'read_only' },
    })

    expect(toolsRegistered).toEqual(['kb_search'])
    expect(streamTextMock).toHaveBeenCalledTimes(1)
    const passed = streamTextCalls[0]!.tools as Record<string, unknown>
    expect(Object.keys(passed).sort()).toEqual(['kb_search'])
  })

  it('exposes read + write tools when the conversation is read_write', () => {
    const server = buildServerWithTools('both')
    const client = createOrchestratorAiClient({
      aiProviderService,
      conversationsService,
      mcpServer: server,
    })

    const { toolsRegistered } = client.streamChat({
      conversation: buildFakeConversation({ mode: 'read_write' }),
      modelClient: fakeModel,
      messages: [],
      toolContext: { organisationId: 'org-1', userId: 'u-1', mode: 'read_write' },
    })

    expect(toolsRegistered.sort()).toEqual(['kb_create_entry', 'kb_search'])
    const passed = streamTextCalls[0]!.tools as Record<string, { description: string, inputSchema: unknown }>
    expect(passed.kb_create_entry!.description).toBe('create KB entry')
    expect(passed.kb_search!.description).toBe('search KB')
    // Ensure no `execute` is wired — manual loop, the chat handler runs tools.
    expect((passed.kb_search as { execute?: unknown }).execute).toBeUndefined()
    expect((passed.kb_create_entry as { execute?: unknown }).execute).toBeUndefined()
  })

  it('passes text deltas through fullStream unchanged', async () => {
    const server = buildServerWithTools('read')
    const client = createOrchestratorAiClient({
      aiProviderService,
      conversationsService,
      mcpServer: server,
    })

    setStreamTextChunks([
      { type: 'text-delta', text: 'hi' },
      { type: 'text-delta', text: ' world' },
    ])

    const { stream } = client.streamChat({
      conversation: buildFakeConversation(),
      modelClient: fakeModel,
      messages: [],
      toolContext: { organisationId: 'org-1', userId: 'u-1', mode: 'read_only' },
    })

    const collected: unknown[] = []
    for await (const chunk of stream.fullStream) {
      collected.push(chunk)
    }
    expect(collected).toEqual([
      { type: 'text-delta', text: 'hi' },
      { type: 'text-delta', text: ' world' },
    ])
  })

  it('passes tool-call deltas through fullStream unchanged', async () => {
    const server = buildServerWithTools('both')
    const client = createOrchestratorAiClient({
      aiProviderService,
      conversationsService,
      mcpServer: server,
    })

    setStreamTextChunks([
      {
        type: 'tool-call',
        toolCallId: 'call-1',
        toolName: 'kb_search',
        input: { q: 'rust' },
      },
    ])

    const { stream } = client.streamChat({
      conversation: buildFakeConversation({ mode: 'read_write' }),
      modelClient: fakeModel,
      messages: [],
      toolContext: { organisationId: 'org-1', userId: 'u-1', mode: 'read_write' },
    })

    const collected: unknown[] = []
    for await (const chunk of stream.fullStream) {
      collected.push(chunk)
    }
    expect(collected).toEqual([
      {
        type: 'tool-call',
        toolCallId: 'call-1',
        toolName: 'kb_search',
        input: { q: 'rust' },
      },
    ])
  })
})
