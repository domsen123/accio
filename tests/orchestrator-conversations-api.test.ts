/**
 * DB-backed integration tests for the orchestrator conversation CRUD service
 * (T-3.9).
 *
 * The HTTP route handlers under `server/api/orchestrator/conversations/` are
 * thin wrappers around `conversationsService` plus
 * `requirePermission(ORCHESTRATOR_USE)` and `resolveWorkspace`. There is no
 * h3-level test harness in this project (mirrors the precedent in
 * `tests/orchestrator-audit-api.test.ts` and the AI service tests) so we
 * exercise:
 *
 *   - Service layer: workspace scoping, capability validation
 *     (`OrchestratorModelInvalidError` reasons), pagination + sort, soft
 *     delete + idempotency, empty-body PATCH rejection (via the schema),
 *     mode + modelId updates, message hydration via `get`.
 *   - Permission seed: Owner role grants `orchestrator:use`; ensures the
 *     route guard has *something* to grant on.
 */
import { sql } from 'drizzle-orm'
import { ulid } from 'ulid'
import { beforeEach, describe, expect, it } from 'vitest'

import * as schema from '../server/database/schema'
import {
  serialiseConversation,
  serialiseConversationListItem,
  serialiseMessage,
  updateConversationSchema,
} from '../server/features/orchestrator/conversation-schemas'
import {
  createConversationsService,
} from '../server/features/orchestrator/conversations.service'
import {
  OrchestratorConversationNotFoundError,
  OrchestratorModelInvalidError,
} from '../server/features/orchestrator/errors'
import { DEFAULT_ROLES } from '../server/features/rbac/rbac.seed'
import { getDatabase } from '../server/infrastructure/database/client'
import { createItemService } from '../server/infrastructure/database/item-service'

import { createOrganisationData, createUserData } from './factories'

const db = getDatabase('app')
const conversationsService = createConversationsService({ db })

const organisationsItemService = createItemService({ db, table: schema.organisations, tableName: 'organisations' })
const usersItemService = createItemService({ db, table: schema.users, tableName: 'users' })

const cleanOrchestratorTables = async () => {
  await db.execute(sql`TRUNCATE TABLE
    orchestrator_actions,
    orchestrator_messages,
    orchestrator_conversations,
    orchestrator_workspace_settings,
    ai_models,
    ai_providers
    CASCADE`)
}

interface Fixture {
  orgId: string
  userId: string
  providerId: string
  modelIds: {
    valid: string
    disabled: string
    lacksTools: string
    lacksStreaming: string
  }
}

const seed = async (): Promise<Fixture> => {
  const orgId = (await organisationsItemService.create(createOrganisationData())).id
  const userId = (await usersItemService.create(createUserData())).id

  const providerId = ulid()
  await db.insert(schema.aiProviders).values({
    id: providerId,
    key: `provider-${providerId.slice(-6)}`,
    displayName: 'Test Provider',
    sdkProviderId: 'anthropic',
    enabled: true,
  })

  const valid = ulid()
  const disabled = ulid()
  const lacksTools = ulid()
  const lacksStreaming = ulid()

  await db.insert(schema.aiModels).values([
    {
      id: valid,
      providerId,
      modelId: `valid-${valid.slice(-6)}`,
      displayName: 'Claude Sonnet (valid)',
      contextWindow: 1_000_000,
      supportsTools: true,
      supportsStreaming: true,
      enabled: true,
    },
    {
      id: disabled,
      providerId,
      modelId: `disabled-${disabled.slice(-6)}`,
      displayName: 'Claude Sonnet (disabled)',
      contextWindow: 1_000_000,
      supportsTools: true,
      supportsStreaming: true,
      enabled: false,
    },
    {
      id: lacksTools,
      providerId,
      modelId: `notools-${lacksTools.slice(-6)}`,
      displayName: 'Lacks tools',
      contextWindow: 1_000_000,
      supportsTools: false,
      supportsStreaming: true,
      enabled: true,
    },
    {
      id: lacksStreaming,
      providerId,
      modelId: `nostream-${lacksStreaming.slice(-6)}`,
      displayName: 'Lacks streaming',
      contextWindow: 1_000_000,
      supportsTools: true,
      supportsStreaming: false,
      enabled: true,
    },
  ])

  return {
    orgId,
    userId,
    providerId,
    modelIds: { valid, disabled, lacksTools, lacksStreaming },
  }
}

/**
 * Test-only helper: write an `orchestrator_messages` row directly. T-3.11
 * will own the public message-creation surface (streaming endpoint) — this
 * helper exists so the CRUD tests can seed conversation history without
 * depending on an unimplemented service.
 */
const insertMessage = async (
  conversationId: string,
  overrides: Partial<typeof schema.orchestratorMessages.$inferInsert> = {},
) => {
  const id = overrides.id ?? ulid()
  await db.insert(schema.orchestratorMessages).values({
    id,
    conversationId,
    role: overrides.role ?? 'user',
    content: overrides.content ?? [{ type: 'text', text: 'hi' }],
    createdAt: overrides.createdAt,
  })
  return id
}

beforeEach(async () => {
  await cleanOrchestratorTables()
})

describe('conversationsService.create', () => {
  it('creates with defaults: empty title, read_only mode, null modelId', async () => {
    const fx = await seed()
    const c = await conversationsService.create({
      organisationId: fx.orgId,
      userId: fx.userId,
    })
    expect(c.title).toBe('')
    expect(c.mode).toBe('read_only')
    expect(c.modelId).toBeNull()
    expect(c.organisationId).toBe(fx.orgId)
    expect(c.userId).toBe(fx.userId)
    expect(c.deletedAt).toBeNull()
  })

  it('creates with explicit mode + modelId', async () => {
    const fx = await seed()
    const c = await conversationsService.create({
      organisationId: fx.orgId,
      userId: fx.userId,
      title: 'Inbox triage',
      mode: 'read_write',
      modelId: fx.modelIds.valid,
    })
    expect(c.title).toBe('Inbox triage')
    expect(c.mode).toBe('read_write')
    expect(c.modelId).toBe(fx.modelIds.valid)
  })

  it('rejects invalid modelId — not_found', async () => {
    const fx = await seed()
    await expect(
      conversationsService.create({
        organisationId: fx.orgId,
        userId: fx.userId,
        modelId: ulid(),
      }),
    ).rejects.toMatchObject({ name: 'OrchestratorModelInvalidError', reason: 'not_found' })
  })

  it('rejects invalid modelId — disabled', async () => {
    const fx = await seed()
    await expect(
      conversationsService.create({
        organisationId: fx.orgId,
        userId: fx.userId,
        modelId: fx.modelIds.disabled,
      }),
    ).rejects.toBeInstanceOf(OrchestratorModelInvalidError)
    await expect(
      conversationsService.create({
        organisationId: fx.orgId,
        userId: fx.userId,
        modelId: fx.modelIds.disabled,
      }),
    ).rejects.toMatchObject({ reason: 'disabled' })
  })

  it('rejects invalid modelId — lacks_tools', async () => {
    const fx = await seed()
    await expect(
      conversationsService.create({
        organisationId: fx.orgId,
        userId: fx.userId,
        modelId: fx.modelIds.lacksTools,
      }),
    ).rejects.toMatchObject({ reason: 'lacks_tools' })
  })

  it('rejects invalid modelId — lacks_streaming', async () => {
    const fx = await seed()
    await expect(
      conversationsService.create({
        organisationId: fx.orgId,
        userId: fx.userId,
        modelId: fx.modelIds.lacksStreaming,
      }),
    ).rejects.toMatchObject({ reason: 'lacks_streaming' })
  })
})

describe('conversationsService.list', () => {
  it('returns only rows from the requested organisation', async () => {
    const a = await seed()
    const b = await seed()

    await conversationsService.create({ organisationId: a.orgId, userId: a.userId, title: 'a-1' })
    await conversationsService.create({ organisationId: a.orgId, userId: a.userId, title: 'a-2' })
    await conversationsService.create({ organisationId: b.orgId, userId: b.userId, title: 'b-1' })

    const result = await conversationsService.list({ organisationId: a.orgId })
    expect(result.total).toBe(2)
    expect(result.rows.map(r => r.title).sort()).toEqual(['a-1', 'a-2'])
    expect(result.rows.every(r => r.organisationId === a.orgId)).toBe(true)
  })

  it('excludes soft-deleted by default; includeDeleted=true returns them', async () => {
    const fx = await seed()
    const live = await conversationsService.create({ organisationId: fx.orgId, userId: fx.userId, title: 'live' })
    const dead = await conversationsService.create({ organisationId: fx.orgId, userId: fx.userId, title: 'dead' })
    await conversationsService.softDelete({ id: dead.id, organisationId: fx.orgId })

    const visible = await conversationsService.list({ organisationId: fx.orgId })
    expect(visible.total).toBe(1)
    expect(visible.rows[0]!.id).toBe(live.id)

    const everything = await conversationsService.list({ organisationId: fx.orgId, includeDeleted: true })
    expect(everything.total).toBe(2)
    expect(everything.rows.find(r => r.id === dead.id)?.deletedAt).toBeInstanceOf(Date)
  })

  it('honours limit + offset, sort, and reports accurate total', async () => {
    const fx = await seed()
    const ids: string[] = []
    for (let i = 0; i < 5; i += 1) {
      const c = await conversationsService.create({
        organisationId: fx.orgId,
        userId: fx.userId,
        title: `c-${i}`,
      })
      ids.push(c.id)
      // Stamp createdAt so sort:asc is deterministic.
      await db.update(schema.orchestratorConversations)
        .set({
          createdAt: new Date(Date.UTC(2030, 0, i + 1)),
          updatedAt: new Date(Date.UTC(2030, 0, i + 1)),
        })
        .where(sql`id = ${c.id}`)
    }

    const desc = await conversationsService.list({
      organisationId: fx.orgId,
      sort: 'updatedAt:desc',
      limit: 2,
      offset: 0,
    })
    expect(desc.total).toBe(5)
    expect(desc.rows).toHaveLength(2)
    expect(desc.rows.map(r => r.title)).toEqual(['c-4', 'c-3'])

    const asc = await conversationsService.list({
      organisationId: fx.orgId,
      sort: 'createdAt:asc',
      limit: 3,
      offset: 1,
    })
    expect(asc.total).toBe(5)
    expect(asc.rows.map(r => r.title)).toEqual(['c-1', 'c-2', 'c-3'])
  })

  it('emits lastMessageAt — null when no messages, max(createdAt) otherwise', async () => {
    const fx = await seed()
    const empty = await conversationsService.create({
      organisationId: fx.orgId,
      userId: fx.userId,
      title: 'empty',
    })
    const chatty = await conversationsService.create({
      organisationId: fx.orgId,
      userId: fx.userId,
      title: 'chatty',
    })
    const t0 = new Date('2030-01-01T00:00:00.000Z')
    const t1 = new Date('2030-01-02T00:00:00.000Z')
    await insertMessage(chatty.id, { createdAt: t0 })
    await insertMessage(chatty.id, { createdAt: t1, role: 'assistant', content: [{ type: 'text', text: 'reply' }] })

    const { rows } = await conversationsService.list({ organisationId: fx.orgId })
    const emptyRow = rows.find(r => r.id === empty.id)!
    const chattyRow = rows.find(r => r.id === chatty.id)!
    expect(emptyRow.lastMessageAt).toBeNull()
    expect(chattyRow.lastMessageAt!.toISOString()).toBe(t1.toISOString())
  })
})

describe('conversationsService.get', () => {
  it('returns conversation + ordered messages by default', async () => {
    const fx = await seed()
    const c = await conversationsService.create({ organisationId: fx.orgId, userId: fx.userId })

    const t0 = new Date('2030-01-01T00:00:00.000Z')
    const t1 = new Date('2030-01-02T00:00:00.000Z')
    const t2 = new Date('2030-01-03T00:00:00.000Z')
    await insertMessage(c.id, { createdAt: t1, role: 'assistant', content: [{ type: 'text', text: 'b' }] })
    await insertMessage(c.id, { createdAt: t0, role: 'user', content: [{ type: 'text', text: 'a' }] })
    await insertMessage(c.id, { createdAt: t2, role: 'tool_result', content: [{ type: 'tool_result', value: 1 }] })

    const result = await conversationsService.get({ id: c.id, organisationId: fx.orgId })
    expect(result.conversation.id).toBe(c.id)
    expect(result.messages).toHaveLength(3)
    expect(result.messages!.map(m => m.createdAt.toISOString())).toEqual([
      t0.toISOString(),
      t1.toISOString(),
      t2.toISOString(),
    ])
  })

  it('omits messages when includeMessages=false', async () => {
    const fx = await seed()
    const c = await conversationsService.create({ organisationId: fx.orgId, userId: fx.userId })
    await insertMessage(c.id)

    const result = await conversationsService.get({
      id: c.id,
      organisationId: fx.orgId,
      includeMessages: false,
    })
    expect(result.conversation.id).toBe(c.id)
    expect(result.messages).toBeUndefined()
  })

  it('cross-org id throws not-found (no leak)', async () => {
    const a = await seed()
    const b = await seed()
    const c = await conversationsService.create({ organisationId: a.orgId, userId: a.userId })

    await expect(
      conversationsService.get({ id: c.id, organisationId: b.orgId }),
    ).rejects.toBeInstanceOf(OrchestratorConversationNotFoundError)
  })

  it('soft-deleted defaults to not-found; includeDeleted=true returns row', async () => {
    const fx = await seed()
    const c = await conversationsService.create({ organisationId: fx.orgId, userId: fx.userId })
    await conversationsService.softDelete({ id: c.id, organisationId: fx.orgId })

    await expect(
      conversationsService.get({ id: c.id, organisationId: fx.orgId }),
    ).rejects.toBeInstanceOf(OrchestratorConversationNotFoundError)

    const result = await conversationsService.get({
      id: c.id,
      organisationId: fx.orgId,
      includeDeleted: true,
      includeMessages: false,
    })
    expect(result.conversation.id).toBe(c.id)
    expect(result.conversation.deletedAt).toBeInstanceOf(Date)
  })
})

describe('conversationsService.update', () => {
  it('updates title only', async () => {
    const fx = await seed()
    const c = await conversationsService.create({ organisationId: fx.orgId, userId: fx.userId })
    const updated = await conversationsService.update({
      id: c.id,
      organisationId: fx.orgId,
      title: 'New title',
    })
    expect(updated.title).toBe('New title')
    expect(updated.mode).toBe('read_only')
    expect(updated.modelId).toBeNull()
  })

  it('updates mode mid-conversation (REQ-ORCH-3)', async () => {
    const fx = await seed()
    const c = await conversationsService.create({ organisationId: fx.orgId, userId: fx.userId })
    const updated = await conversationsService.update({
      id: c.id,
      organisationId: fx.orgId,
      mode: 'read_write',
    })
    expect(updated.mode).toBe('read_write')
  })

  it('updates modelId after capability validation', async () => {
    const fx = await seed()
    const c = await conversationsService.create({ organisationId: fx.orgId, userId: fx.userId })
    const updated = await conversationsService.update({
      id: c.id,
      organisationId: fx.orgId,
      modelId: fx.modelIds.valid,
    })
    expect(updated.modelId).toBe(fx.modelIds.valid)
  })

  it('rejects invalid modelId (lacks_streaming) on update', async () => {
    const fx = await seed()
    const c = await conversationsService.create({ organisationId: fx.orgId, userId: fx.userId })
    await expect(
      conversationsService.update({
        id: c.id,
        organisationId: fx.orgId,
        modelId: fx.modelIds.lacksStreaming,
      }),
    ).rejects.toMatchObject({ reason: 'lacks_streaming' })
  })

  it('cross-org or soft-deleted target throws not-found', async () => {
    const a = await seed()
    const b = await seed()
    const c = await conversationsService.create({ organisationId: a.orgId, userId: a.userId })

    await expect(
      conversationsService.update({ id: c.id, organisationId: b.orgId, title: 'x' }),
    ).rejects.toBeInstanceOf(OrchestratorConversationNotFoundError)

    await conversationsService.softDelete({ id: c.id, organisationId: a.orgId })
    await expect(
      conversationsService.update({ id: c.id, organisationId: a.orgId, title: 'x' }),
    ).rejects.toBeInstanceOf(OrchestratorConversationNotFoundError)
  })
})

describe('conversationsService.softDelete', () => {
  it('flips deleted_at and is idempotent on already-deleted rows', async () => {
    const fx = await seed()
    const c = await conversationsService.create({ organisationId: fx.orgId, userId: fx.userId })

    await conversationsService.softDelete({ id: c.id, organisationId: fx.orgId })
    await conversationsService.softDelete({ id: c.id, organisationId: fx.orgId })

    const row = await conversationsService.get({
      id: c.id,
      organisationId: fx.orgId,
      includeDeleted: true,
      includeMessages: false,
    })
    expect(row.conversation.deletedAt).toBeInstanceOf(Date)
  })

  it('cross-org soft delete is a no-op (does not touch the row)', async () => {
    const a = await seed()
    const b = await seed()
    const c = await conversationsService.create({ organisationId: a.orgId, userId: a.userId })

    await conversationsService.softDelete({ id: c.id, organisationId: b.orgId })

    const row = await conversationsService.get({ id: c.id, organisationId: a.orgId, includeMessages: false })
    expect(row.conversation.deletedAt).toBeNull()
  })

  it('idempotent on missing row', async () => {
    const fx = await seed()
    await expect(
      conversationsService.softDelete({ id: ulid(), organisationId: fx.orgId }),
    ).resolves.toBeUndefined()
  })
})

describe('conversation-schemas', () => {
  it('updateConversationSchema rejects an empty body', () => {
    const result = updateConversationSchema.safeParse({})
    expect(result.success).toBe(false)
  })

  it('updateConversationSchema accepts a single field', () => {
    expect(updateConversationSchema.safeParse({ title: 'x' }).success).toBe(true)
    expect(updateConversationSchema.safeParse({ mode: 'read_write' }).success).toBe(true)
    expect(updateConversationSchema.safeParse({ modelId: 'abc' }).success).toBe(true)
    expect(updateConversationSchema.safeParse({ modelId: null }).success).toBe(true)
  })

  it('updateConversationSchema rejects bogus mode', () => {
    expect(updateConversationSchema.safeParse({ mode: 'admin' }).success).toBe(false)
  })

  it('serialiseConversation emits ISO strings', async () => {
    const fx = await seed()
    const c = await conversationsService.create({ organisationId: fx.orgId, userId: fx.userId })
    const json = serialiseConversation(c)
    expect(typeof json.createdAt).toBe('string')
    expect(typeof json.updatedAt).toBe('string')
    expect(json.deletedAt).toBeNull()
  })

  it('serialiseConversationListItem includes lastMessageAt', async () => {
    const fx = await seed()
    const c = await conversationsService.create({ organisationId: fx.orgId, userId: fx.userId })
    const t = new Date('2030-06-01T12:00:00.000Z')
    await insertMessage(c.id, { createdAt: t })
    const { rows } = await conversationsService.list({ organisationId: fx.orgId })
    const json = serialiseConversationListItem(rows[0]!)
    expect(json.lastMessageAt).toBe(t.toISOString())
  })

  it('serialiseMessage passes content jsonb verbatim', async () => {
    const fx = await seed()
    const c = await conversationsService.create({ organisationId: fx.orgId, userId: fx.userId })
    const content = [{ type: 'text', text: 'hello' }, { type: 'tool_use', name: 'kb_search', input: { q: 'x' } }]
    const id = await insertMessage(c.id, { content, role: 'assistant' })

    const result = await conversationsService.get({ id: c.id, organisationId: fx.orgId })
    const msg = result.messages!.find(m => m.id === id)!
    const json = serialiseMessage(msg)
    expect(json.role).toBe('assistant')
    expect(json.content).toEqual(content)
    expect(typeof json.createdAt).toBe('string')
  })
})

describe('rbac seed — orchestrator:use assignments', () => {
  it('grants orchestrator:use to Owner role on organisation scope', () => {
    const owner = DEFAULT_ROLES.find(r => r.name === 'Owner' && r.scope === 'organisation')
    expect(owner?.permissions).toContain('orchestrator:use')
  })
})
