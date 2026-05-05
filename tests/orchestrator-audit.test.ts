import type { McpToolContext, Tool } from '../server/features/orchestrator/mcp-server'
import { eq, sql } from 'drizzle-orm'
import { ulid } from 'ulid'
import { beforeEach, describe, expect, it } from 'vitest'
import { z } from 'zod'

import * as schema from '../server/database/schema'
import {
  auditedInvoke,
  createAuditService,
} from '../server/features/orchestrator/audit'
import { McpToolNotFoundEntityError } from '../server/features/orchestrator/errors'
import { createMcpServer } from '../server/features/orchestrator/mcp-server'
import { getDatabase } from '../server/infrastructure/database/client'
import { createItemService } from '../server/infrastructure/database/item-service'

import { createOrganisationData, createUserData } from './factories'

// DB-backed integration tests for T-3.7 audit log writes. Every assertion
// reads the actual `orchestrator_actions` row(s) back from the database to
// lock in the on-disk shape.

const db = getDatabase('app')
const auditService = createAuditService({ db })

const organisationsItemService = createItemService({ db, table: schema.organisations, tableName: 'organisations' })
const usersItemService = createItemService({ db, table: schema.users, tableName: 'users' })

// `orchestrator_actions` cascades from `organisations`, but the AI tables
// (`ai_models`, `orchestrator_conversations`, `orchestrator_messages`) are not
// in the global TRUNCATE cascade. Clean them explicitly so each test starts
// fresh — same pattern as `tests/ai-config.test.ts`.
const cleanOrchestratorTables = async () => {
  await db.execute(sql`TRUNCATE TABLE
    orchestrator_actions,
    orchestrator_messages,
    orchestrator_conversations,
    ai_models,
    ai_providers
    CASCADE`)
}

interface Fixture {
  orgId: string
  userId: string
  conversationId: string
  modelId: string
}

const seedFixture = async (): Promise<Fixture> => {
  const orgId = (await organisationsItemService.create(createOrganisationData())).id
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

  const conversationId = ulid()
  await db.insert(schema.orchestratorConversations).values({
    id: conversationId,
    organisationId: orgId,
    userId,
    title: 'Audit test conversation',
    mode: 'read_write',
    modelId,
  })

  return { orgId, userId, conversationId, modelId }
}

const ctxFor = (f: Fixture, overrides: Partial<McpToolContext> = {}): McpToolContext => ({
  organisationId: f.orgId,
  userId: f.userId,
  conversationId: f.conversationId,
  mode: 'read_write',
  ...overrides,
})

// ─── Test tools ────────────────────────────────────────────────────────────

interface WriteInput { value: string }
interface WriteOutput { wrote: string }

const writeSchema = z.object({ value: z.string().trim() })

const makeAutoWriteTool = (handler?: (input: WriteInput) => WriteOutput): Tool<WriteInput, WriteOutput> => ({
  name: 'fake_write',
  description: 'Auto write tool for audit tests.',
  schema: writeSchema,
  class: 'auto',
  mode: 'write',
  handler: handler ?? ((input: WriteInput) => ({ wrote: input.value })),
})

const makeConfirmWriteTool = (handler?: (input: WriteInput) => WriteOutput): Tool<WriteInput, WriteOutput> => ({
  name: 'fake_confirm_write',
  description: 'Confirm-class write tool for audit tests.',
  schema: writeSchema,
  class: 'confirm',
  mode: 'write',
  handler: handler ?? ((input: WriteInput) => ({ wrote: input.value })),
})

interface ReadInput { q: string }
const makeReadTool = (): Tool<ReadInput, { found: number }> => ({
  name: 'fake_read',
  description: 'Read tool for audit tests.',
  schema: z.object({ q: z.string().trim() }),
  class: 'auto',
  mode: 'read',
  handler: () => ({ found: 0 }),
})

interface BulkInput { count: number }
const makeBulkAutoTool = (handler?: (input: BulkInput) => { touched: number }): Tool<BulkInput, { touched: number }> => ({
  name: 'fake_bulk',
  description: 'Bulk-promotable auto write tool.',
  schema: z.object({ count: z.number().int().min(0) }),
  class: 'auto',
  mode: 'write',
  handler: handler ?? ((input: BulkInput) => ({ touched: input.count })),
  affectedCount: input => input.count,
})

const readActionRows = async (organisationId: string) =>
  db.query.orchestratorActions.findMany({
    where: eq(schema.orchestratorActions.organisationId, organisationId),
    orderBy: schema.orchestratorActions.createdAt,
  })

beforeEach(async () => {
  await cleanOrchestratorTables()
})

describe('auditedInvoke — auto write tool', () => {
  it('writes one executed row with correct shape on a successful auto invocation', async () => {
    const fixture = await seedFixture()
    const server = createMcpServer()
    server.register(makeAutoWriteTool())

    const out = await auditedInvoke<WriteOutput>({
      server,
      audit: auditService,
      name: 'fake_write',
      input: { value: 'hello' },
      ctx: ctxFor(fixture),
      modelId: fixture.modelId,
    })

    expect(out.kind).toBe('executed')
    if (out.kind !== 'executed')
      throw new Error('unreachable')
    expect(out.result.toolName).toBe('fake_write')
    expect(out.result.result).toEqual({ wrote: 'hello' })

    const rows = await readActionRows(fixture.orgId)
    expect(rows).toHaveLength(1)
    const row = rows[0]!
    expect(row.id).toBe(out.actionId)
    expect(row.toolName).toBe('fake_write')
    expect(row.parameters).toEqual({ value: 'hello' })
    expect(row.class).toBe('auto')
    expect(row.status).toBe('executed')
    expect(row.affectedCount).toBe(1)
    expect(row.executedAt).toBeInstanceOf(Date)
    expect(row.result).toEqual({ wrote: 'hello' })
    expect(row.modelId).toBe(fixture.modelId)
    expect(row.userId).toBe(fixture.userId)
    expect(row.conversationId).toBe(fixture.conversationId)
    expect(row.organisationId).toBe(fixture.orgId)
    expect(row.messageId).toBeNull()
    expect(row.error).toBeNull()
    expect(row.confirmedAt).toBeNull()
    expect(row.cancelledAt).toBeNull()
  })
})

describe('auditedInvoke — read tool', () => {
  it('does NOT write an audit row for a read tool (REQ-ORCH-6 covers writes only)', async () => {
    const fixture = await seedFixture()
    const server = createMcpServer()
    server.register(makeReadTool())

    const out = await auditedInvoke({
      server,
      audit: auditService,
      name: 'fake_read',
      input: { q: 'anything' },
      ctx: ctxFor(fixture),
      modelId: fixture.modelId,
    })

    expect(out.kind).toBe('executed')
    if (out.kind !== 'executed')
      throw new Error('unreachable')
    expect(out.actionId).toBe('')

    const rows = await readActionRows(fixture.orgId)
    expect(rows).toHaveLength(0)
  })
})

describe('auditedInvoke — confirmation gate', () => {
  it('without token: writes pending_confirmation row, returns envelope, handler is not called', async () => {
    const fixture = await seedFixture()
    const server = createMcpServer()
    let handlerCalls = 0
    server.register(makeConfirmWriteTool((input) => {
      handlerCalls++
      return { wrote: input.value }
    }))

    const out = await auditedInvoke({
      server,
      audit: auditService,
      name: 'fake_confirm_write',
      input: { value: 'pending' },
      ctx: ctxFor(fixture),
      modelId: fixture.modelId,
    })

    expect(handlerCalls).toBe(0)
    expect(out.kind).toBe('confirmation_required')
    if (out.kind !== 'confirmation_required')
      throw new Error('unreachable')
    expect(out.toolName).toBe('fake_confirm_write')
    expect(out.input).toEqual({ value: 'pending' })
    expect(out.affectedCount).toBe(1)
    expect(out.reason).toBe('class')

    const rows = await readActionRows(fixture.orgId)
    expect(rows).toHaveLength(1)
    const row = rows[0]!
    expect(row.id).toBe(out.actionId)
    expect(row.status).toBe('pending_confirmation')
    expect(row.class).toBe('confirm')
    expect(row.toolName).toBe('fake_confirm_write')
    expect(row.parameters).toEqual({ value: 'pending' })
    expect(row.affectedCount).toBe(1)
    expect(row.executedAt).toBeNull()
    expect(row.confirmedAt).toBeNull()
    expect(row.result).toBeNull()
    expect(row.modelId).toBe(fixture.modelId)
  })

  it('with token + priorActionId: marks the existing row confirmed then executed (one row, not two)', async () => {
    const fixture = await seedFixture()
    const server = createMcpServer()
    let handlerCalls = 0
    server.register(makeConfirmWriteTool((input) => {
      handlerCalls++
      return { wrote: input.value }
    }))

    // First call — gate fires.
    const gated = await auditedInvoke({
      server,
      audit: auditService,
      name: 'fake_confirm_write',
      input: { value: 'go' },
      ctx: ctxFor(fixture),
      modelId: fixture.modelId,
    })
    if (gated.kind !== 'confirmation_required')
      throw new Error('expected confirmation_required')
    const priorActionId = gated.actionId

    // Re-entry with token + priorActionId.
    const out = await auditedInvoke<WriteOutput>({
      server,
      audit: auditService,
      name: 'fake_confirm_write',
      input: { value: 'go' },
      ctx: ctxFor(fixture, { confirmationToken: 'tok' }),
      modelId: fixture.modelId,
      priorActionId,
    })

    expect(handlerCalls).toBe(1)
    expect(out.kind).toBe('executed')
    if (out.kind !== 'executed')
      throw new Error('unreachable')
    expect(out.actionId).toBe(priorActionId)
    expect(out.result.result).toEqual({ wrote: 'go' })

    // Still exactly one row — the original got patched, no new insert.
    const rows = await readActionRows(fixture.orgId)
    expect(rows).toHaveLength(1)
    const row = rows[0]!
    expect(row.id).toBe(priorActionId)
    expect(row.status).toBe('executed')
    expect(row.class).toBe('confirm')
    expect(row.confirmedAt).toBeInstanceOf(Date)
    expect(row.executedAt).toBeInstanceOf(Date)
    expect(row.result).toEqual({ wrote: 'go' })
  })
})

describe('auditedInvoke — handler failure', () => {
  it('records a failed row with the error message; throws unchanged', async () => {
    const fixture = await seedFixture()
    const server = createMcpServer()
    server.register({
      name: 'flaky_write',
      description: 'Throws on purpose.',
      schema: writeSchema,
      class: 'auto',
      mode: 'write',
      handler: () => {
        throw new McpToolNotFoundEntityError('flaky_write', 'kb_entry', 'missing-slug')
      },
    } as Tool<WriteInput, WriteOutput>)

    let caught: unknown
    try {
      await auditedInvoke({
        server,
        audit: auditService,
        name: 'flaky_write',
        input: { value: 'x' },
        ctx: ctxFor(fixture),
        modelId: fixture.modelId,
      })
    }
    catch (err) {
      caught = err
    }
    expect(caught).toBeInstanceOf(McpToolNotFoundEntityError)

    const rows = await readActionRows(fixture.orgId)
    expect(rows).toHaveLength(1)
    const row = rows[0]!
    expect(row.status).toBe('failed')
    expect(row.class).toBe('auto')
    expect(row.error).toBe('kb_entry "missing-slug" not found')
    expect(row.executedAt).toBeNull()
    expect(row.result).toBeNull()
  })
})

describe('auditedInvoke — bulk override (ADR-010)', () => {
  it('records class=auto + status=pending_confirmation when affectedCount >= 6 and no token', async () => {
    const fixture = await seedFixture()
    const server = createMcpServer()
    server.register(makeBulkAutoTool())

    const out = await auditedInvoke({
      server,
      audit: auditService,
      name: 'fake_bulk',
      input: { count: 7 },
      ctx: ctxFor(fixture),
      modelId: fixture.modelId,
    })
    expect(out.kind).toBe('confirmation_required')
    if (out.kind !== 'confirmation_required')
      throw new Error('unreachable')
    expect(out.reason).toBe('bulk')
    expect(out.affectedCount).toBe(7)

    const rows = await readActionRows(fixture.orgId)
    expect(rows).toHaveLength(1)
    const row = rows[0]!
    // Declared class preserved on the row even though gate fired.
    expect(row.class).toBe('auto')
    expect(row.status).toBe('pending_confirmation')
    expect(row.affectedCount).toBe(7)
  })

  it('after re-invoke with token: row transitions to executed (still class=auto, affectedCount populated)', async () => {
    const fixture = await seedFixture()
    const server = createMcpServer()
    server.register(makeBulkAutoTool())

    const gated = await auditedInvoke({
      server,
      audit: auditService,
      name: 'fake_bulk',
      input: { count: 8 },
      ctx: ctxFor(fixture),
      modelId: fixture.modelId,
    })
    if (gated.kind !== 'confirmation_required')
      throw new Error('expected confirmation_required')

    const out = await auditedInvoke<{ touched: number }>({
      server,
      audit: auditService,
      name: 'fake_bulk',
      input: { count: 8 },
      ctx: ctxFor(fixture, { confirmationToken: 'tok' }),
      modelId: fixture.modelId,
      priorActionId: gated.actionId,
    })
    expect(out.kind).toBe('executed')
    if (out.kind !== 'executed')
      throw new Error('unreachable')

    const rows = await readActionRows(fixture.orgId)
    expect(rows).toHaveLength(1)
    const row = rows[0]!
    expect(row.id).toBe(gated.actionId)
    expect(row.class).toBe('auto')
    expect(row.status).toBe('executed')
    expect(row.affectedCount).toBe(8)
    expect(row.confirmedAt).toBeInstanceOf(Date)
    expect(row.executedAt).toBeInstanceOf(Date)
    expect(row.result).toEqual({ touched: 8 })
  })
})

describe('auditService — direct method surface', () => {
  it('attachMessageId updates the row', async () => {
    const fixture = await seedFixture()
    const server = createMcpServer()
    server.register(makeAutoWriteTool())

    const out = await auditedInvoke<WriteOutput>({
      server,
      audit: auditService,
      name: 'fake_write',
      input: { value: 'x' },
      ctx: ctxFor(fixture),
      modelId: fixture.modelId,
    })
    if (out.kind !== 'executed')
      throw new Error('unreachable')

    const messageId = ulid()
    await db.insert(schema.orchestratorMessages).values({
      id: messageId,
      conversationId: fixture.conversationId,
      role: 'assistant',
      content: [{ type: 'text', text: 'ok' }],
    })

    await auditService.attachMessageId(out.actionId, messageId)

    const rows = await readActionRows(fixture.orgId)
    expect(rows).toHaveLength(1)
    expect(rows[0]!.messageId).toBe(messageId)
  })

  it('recordCancelled flips a pending row to cancelled with cancelledAt set', async () => {
    const fixture = await seedFixture()
    const { actionId } = await auditService.recordPending({
      organisationId: fixture.orgId,
      conversationId: fixture.conversationId,
      userId: fixture.userId,
      modelId: fixture.modelId,
      toolName: 'whatever',
      parameters: { x: 1 },
      class: 'confirm',
      affectedCount: 1,
    })

    await auditService.recordCancelled(actionId)

    const rows = await readActionRows(fixture.orgId)
    expect(rows).toHaveLength(1)
    expect(rows[0]!.status).toBe('cancelled')
    expect(rows[0]!.cancelledAt).toBeInstanceOf(Date)
  })

  it('markConfirmed flips a pending row to confirmed with confirmedAt set', async () => {
    const fixture = await seedFixture()
    const { actionId } = await auditService.recordPending({
      organisationId: fixture.orgId,
      conversationId: fixture.conversationId,
      userId: fixture.userId,
      modelId: fixture.modelId,
      toolName: 'whatever',
      parameters: { x: 1 },
      class: 'confirm',
      affectedCount: 1,
    })

    await auditService.markConfirmed(actionId)

    const rows = await readActionRows(fixture.orgId)
    expect(rows).toHaveLength(1)
    expect(rows[0]!.status).toBe('confirmed')
    expect(rows[0]!.confirmedAt).toBeInstanceOf(Date)
  })
})
