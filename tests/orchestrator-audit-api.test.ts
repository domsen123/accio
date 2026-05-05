/**
 * DB-backed integration tests for the audit-log read API surface (T-3.8).
 *
 * The HTTP route handlers (`server/api/orchestrator/audit/{index,[id]}.get.ts`)
 * are thin wrappers around `auditService.list` / `auditService.findById` plus
 * `requirePermission(ORCHESTRATOR_AUDIT_VIEW)` and `resolveWorkspace`. There
 * is no h3-level test harness in the project (per `tests/setup.ts` and the
 * existing `*-config.test.ts` pattern), so we exercise:
 *
 *   - Service layer: workspace scoping, filter combos, pagination, sort,
 *     `total` accuracy, hydrated joins, `findById` cross-org behaviour.
 *   - Permission seed: Owner role grants `orchestrator:audit:view`; Admin /
 *     Member do not. (Asserts the seed file referenced from the task brief.)
 */
import { sql } from 'drizzle-orm'
import { ulid } from 'ulid'
import { beforeEach, describe, expect, it } from 'vitest'

import * as schema from '../server/database/schema'
import { createAuditService } from '../server/features/orchestrator/audit'
import { auditListQuerySchema, serialiseAuditRow } from '../server/features/orchestrator/audit-schemas'
import { DEFAULT_ROLES } from '../server/features/rbac/rbac.seed'
import { getDatabase } from '../server/infrastructure/database/client'
import { createItemService } from '../server/infrastructure/database/item-service'

import { createOrganisationData, createUserData } from './factories'

const db = getDatabase('app')
const auditService = createAuditService({ db })

const organisationsItemService = createItemService({ db, table: schema.organisations, tableName: 'organisations' })
const usersItemService = createItemService({ db, table: schema.users, tableName: 'users' })

const cleanOrchestratorTables = async () => {
  await db.execute(sql`TRUNCATE TABLE
    orchestrator_actions,
    orchestrator_messages,
    orchestrator_conversations,
    ai_models,
    ai_providers
    CASCADE`)
}

interface WorkspaceFixture {
  orgId: string
  userId: string
  conversationId: string
  modelId: string
  modelDisplayName: string
  modelModelId: string
}

const seedWorkspace = async (modelOverrides?: { modelId?: string, displayName?: string }): Promise<WorkspaceFixture> => {
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

  const modelId = ulid()
  const modelModelId = modelOverrides?.modelId ?? `claude-sonnet-${providerId.slice(-4)}`
  const displayName = modelOverrides?.displayName ?? 'Claude Sonnet 4.6'
  await db.insert(schema.aiModels).values({
    id: modelId,
    providerId,
    modelId: modelModelId,
    displayName,
    contextWindow: 1_000_000,
    supportsTools: true,
    supportsStreaming: true,
    enabled: true,
  })

  const conversationId = ulid()
  await db.insert(schema.orchestratorConversations).values({
    id: conversationId,
    organisationId: orgId,
    userId,
    title: `Conversation ${conversationId.slice(-6)}`,
    mode: 'read_write',
    modelId,
  })

  return { orgId, userId, conversationId, modelId, modelDisplayName: displayName, modelModelId }
}

const insertAction = async (
  fx: WorkspaceFixture,
  overrides: Partial<typeof schema.orchestratorActions.$inferInsert> = {},
) => {
  const id = overrides.id ?? ulid()
  await db.insert(schema.orchestratorActions).values({
    id,
    organisationId: fx.orgId,
    conversationId: fx.conversationId,
    userId: fx.userId,
    modelId: fx.modelId,
    toolName: 'kb_update_entry',
    parameters: { value: 'x' },
    class: 'auto',
    status: 'executed',
    affectedCount: 1,
    executedAt: new Date(),
    ...overrides,
  })
  return id
}

beforeEach(async () => {
  await cleanOrchestratorTables()
})

describe('auditService.list — workspace scoping', () => {
  it('returns only rows from the requested organisation', async () => {
    const a = await seedWorkspace()
    const b = await seedWorkspace()

    await insertAction(a, { toolName: 'kb_create_entry' })
    await insertAction(a, { toolName: 'kb_update_entry' })
    await insertAction(b, { toolName: 'todo_create' })

    const result = await auditService.list({ organisationId: a.orgId })

    expect(result.total).toBe(2)
    expect(result.rows).toHaveLength(2)
    expect(result.rows.every(r => r.organisationId === a.orgId)).toBe(true)
    expect(result.rows.map(r => r.toolName).sort()).toEqual(['kb_create_entry', 'kb_update_entry'])
  })

  it('hydrates the model attribution + conversation title', async () => {
    const fx = await seedWorkspace({ displayName: 'Claude Sonnet 4.6', modelId: 'claude-sonnet-4-6' })
    await insertAction(fx, { toolName: 'kb_update_entry' })

    const { rows } = await auditService.list({ organisationId: fx.orgId })
    expect(rows).toHaveLength(1)
    expect(rows[0]!.model).toEqual({
      id: fx.modelId,
      displayName: 'Claude Sonnet 4.6',
      modelId: 'claude-sonnet-4-6',
    })
    expect(rows[0]!.conversationTitle).toContain('Conversation ')
  })
})

describe('auditService.list — filters', () => {
  it('filters by toolName substring', async () => {
    const fx = await seedWorkspace()
    await insertAction(fx, { toolName: 'kb_update_entry' })
    await insertAction(fx, { toolName: 'kb_create_entry' })
    await insertAction(fx, { toolName: 'todo_create' })

    const { rows, total } = await auditService.list({
      organisationId: fx.orgId,
      filter: { toolName: 'kb_' },
    })
    expect(total).toBe(2)
    expect(rows.map(r => r.toolName).sort()).toEqual(['kb_create_entry', 'kb_update_entry'])
  })

  it('filters by status (multi)', async () => {
    const fx = await seedWorkspace()
    await insertAction(fx, { status: 'executed' })
    await insertAction(fx, { status: 'failed', error: 'boom' })
    await insertAction(fx, { status: 'cancelled', cancelledAt: new Date() })

    const { rows, total } = await auditService.list({
      organisationId: fx.orgId,
      filter: { status: ['failed', 'cancelled'] },
    })
    expect(total).toBe(2)
    expect(rows.map(r => r.status).sort()).toEqual(['cancelled', 'failed'])
  })

  it('filters by class', async () => {
    const fx = await seedWorkspace()
    await insertAction(fx, { class: 'auto' })
    await insertAction(fx, { class: 'confirm' })
    await insertAction(fx, { class: 'confirm' })

    const { rows, total } = await auditService.list({
      organisationId: fx.orgId,
      filter: { class: ['confirm'] },
    })
    expect(total).toBe(2)
    expect(rows.every(r => r.class === 'confirm')).toBe(true)
  })

  it('filters by modelId', async () => {
    const fx = await seedWorkspace()

    // Add a second model on the same provider so we can filter on one of them.
    const otherModelId = ulid()
    const providers = await db.query.aiProviders.findMany({})
    await db.insert(schema.aiModels).values({
      id: otherModelId,
      providerId: providers[0]!.id,
      modelId: 'gpt-5',
      displayName: 'GPT-5',
      contextWindow: 200_000,
      supportsTools: true,
      supportsStreaming: true,
      enabled: true,
    })

    await insertAction(fx, { modelId: fx.modelId })
    await insertAction(fx, { modelId: otherModelId })
    await insertAction(fx, { modelId: otherModelId })

    const { rows, total } = await auditService.list({
      organisationId: fx.orgId,
      filter: { modelId: otherModelId },
    })
    expect(total).toBe(2)
    expect(rows.every(r => r.model?.id === otherModelId)).toBe(true)
  })

  it('filters by date range (since / until)', async () => {
    const fx = await seedWorkspace()
    const t0 = new Date('2030-01-01T00:00:00.000Z')
    const t1 = new Date('2030-01-02T00:00:00.000Z')
    const t2 = new Date('2030-01-03T00:00:00.000Z')
    const t3 = new Date('2030-01-04T00:00:00.000Z')

    await insertAction(fx, { createdAt: t0 })
    await insertAction(fx, { createdAt: t1 })
    await insertAction(fx, { createdAt: t2 })
    await insertAction(fx, { createdAt: t3 })

    const { total, rows } = await auditService.list({
      organisationId: fx.orgId,
      filter: { since: t1, until: t2 },
    })
    expect(total).toBe(2)
    expect(rows.map(r => r.createdAt.toISOString()).sort()).toEqual([
      t1.toISOString(),
      t2.toISOString(),
    ])
  })

  it('filters by conversationId', async () => {
    const fx = await seedWorkspace()
    const otherConv = ulid()
    await db.insert(schema.orchestratorConversations).values({
      id: otherConv,
      organisationId: fx.orgId,
      userId: fx.userId,
      title: 'Other',
      mode: 'read_write',
      modelId: fx.modelId,
    })

    await insertAction(fx, { conversationId: fx.conversationId })
    await insertAction(fx, { conversationId: otherConv })

    const { total, rows } = await auditService.list({
      organisationId: fx.orgId,
      filter: { conversationId: otherConv },
    })
    expect(total).toBe(1)
    expect(rows[0]!.conversationId).toBe(otherConv)
  })

  it('combines multiple filters (toolName + status + class)', async () => {
    const fx = await seedWorkspace()
    await insertAction(fx, { toolName: 'kb_update_entry', status: 'executed', class: 'confirm' })
    await insertAction(fx, { toolName: 'kb_update_entry', status: 'failed', class: 'confirm' })
    await insertAction(fx, { toolName: 'kb_create_entry', status: 'executed', class: 'auto' })

    const { total, rows } = await auditService.list({
      organisationId: fx.orgId,
      filter: { toolName: 'kb_update', status: ['executed'], class: ['confirm'] },
    })
    expect(total).toBe(1)
    expect(rows[0]!.toolName).toBe('kb_update_entry')
    expect(rows[0]!.status).toBe('executed')
    expect(rows[0]!.class).toBe('confirm')
  })
})

describe('auditService.list — pagination + sort', () => {
  it('honours limit + offset and reports accurate total', async () => {
    const fx = await seedWorkspace()
    for (let i = 0; i < 5; i += 1) {
      await insertAction(fx, {
        toolName: `tool_${i}`,
        createdAt: new Date(Date.UTC(2030, 0, i + 1)),
      })
    }

    const page1 = await auditService.list({
      organisationId: fx.orgId,
      pagination: { limit: 2, offset: 0 },
    })
    expect(page1.total).toBe(5)
    expect(page1.rows).toHaveLength(2)
    // Default sort is desc — newest first.
    expect(page1.rows[0]!.toolName).toBe('tool_4')

    const page2 = await auditService.list({
      organisationId: fx.orgId,
      pagination: { limit: 2, offset: 2 },
    })
    expect(page2.total).toBe(5)
    expect(page2.rows).toHaveLength(2)
    expect(page2.rows[0]!.toolName).toBe('tool_2')

    const page3 = await auditService.list({
      organisationId: fx.orgId,
      pagination: { limit: 2, offset: 4 },
    })
    expect(page3.rows).toHaveLength(1)
    expect(page3.rows[0]!.toolName).toBe('tool_0')
  })

  it('caps limit at 200 even when callers ask for more', async () => {
    const fx = await seedWorkspace()
    // Insert just one row — the cap is what matters; we assert the result
    // by inspecting the schema's coercion + the service's clamp behaviour.
    await insertAction(fx)

    // Service-level: passing 999 returns the row but should not error.
    const result = await auditService.list({
      organisationId: fx.orgId,
      pagination: { limit: 999 },
    })
    expect(result.rows).toHaveLength(1)

    // Schema-level: parsing a query with limit=999 fails (max 200).
    const parsed = auditListQuerySchema.safeParse({ limit: '999' })
    expect(parsed.success).toBe(false)

    const ok = auditListQuerySchema.safeParse({ limit: '200' })
    expect(ok.success).toBe(true)
  })

  it('supports ascending sort', async () => {
    const fx = await seedWorkspace()
    for (let i = 0; i < 3; i += 1) {
      await insertAction(fx, {
        toolName: `tool_${i}`,
        createdAt: new Date(Date.UTC(2030, 0, i + 1)),
      })
    }

    const { rows } = await auditService.list({
      organisationId: fx.orgId,
      sort: 'createdAt:asc',
    })
    expect(rows.map(r => r.toolName)).toEqual(['tool_0', 'tool_1', 'tool_2'])
  })
})

describe('auditService.findById', () => {
  it('returns a hydrated row when the action belongs to the org', async () => {
    const fx = await seedWorkspace()
    const id = await insertAction(fx, { toolName: 'kb_update_entry' })

    const row = await auditService.findById(id, fx.orgId)
    expect(row).not.toBeNull()
    expect(row!.id).toBe(id)
    expect(row!.toolName).toBe('kb_update_entry')
    expect(row!.model?.id).toBe(fx.modelId)
  })

  it('returns null when the action belongs to a different org (no leak)', async () => {
    const a = await seedWorkspace()
    const b = await seedWorkspace()
    const id = await insertAction(a)

    const row = await auditService.findById(id, b.orgId)
    expect(row).toBeNull()
  })

  it('returns null for unknown ids', async () => {
    const fx = await seedWorkspace()
    const row = await auditService.findById(ulid(), fx.orgId)
    expect(row).toBeNull()
  })
})

describe('audit-schemas — query parsing', () => {
  it('parses a single status value into an array', () => {
    const parsed = auditListQuerySchema.parse({ status: 'executed' })
    expect(parsed.status).toEqual(['executed'])
  })

  it('parses repeated status values into an array', () => {
    const parsed = auditListQuerySchema.parse({ status: ['executed', 'failed'] })
    expect(parsed.status).toEqual(['executed', 'failed'])
  })

  it('rejects unknown status values', () => {
    const result = auditListQuerySchema.safeParse({ status: 'bogus' })
    expect(result.success).toBe(false)
  })

  it('coerces limit + offset from strings', () => {
    const parsed = auditListQuerySchema.parse({ limit: '25', offset: '50' })
    expect(parsed.limit).toBe(25)
    expect(parsed.offset).toBe(50)
  })

  it('rejects malformed since/until', () => {
    const result = auditListQuerySchema.safeParse({ since: 'not a date' })
    expect(result.success).toBe(false)
  })
})

describe('serialiseAuditRow', () => {
  it('emits ISO strings for all timestamps and preserves nulls', async () => {
    const fx = await seedWorkspace()
    const confirmedAt = new Date('2030-06-01T12:00:00.000Z')
    const id = await insertAction(fx, {
      status: 'confirmed',
      confirmedAt,
      executedAt: null,
    })

    const row = await auditService.findById(id, fx.orgId)
    const serialised = serialiseAuditRow(row!)
    expect(typeof serialised.createdAt).toBe('string')
    expect(serialised.confirmedAt).toBe(confirmedAt.toISOString())
    expect(serialised.executedAt).toBeNull()
    expect(serialised.cancelledAt).toBeNull()
  })
})

describe('rbac seed — orchestrator:audit:view assignments', () => {
  it('grants orchestrator:audit:view to Owner only (Admin / Member do not)', () => {
    const owner = DEFAULT_ROLES.find(r => r.name === 'Owner' && r.scope === 'organisation')
    const admin = DEFAULT_ROLES.find(r => r.name === 'Admin' && r.scope === 'organisation')
    const member = DEFAULT_ROLES.find(r => r.name === 'Member' && r.scope === 'organisation')

    expect(owner?.permissions).toContain('orchestrator:audit:view')
    expect(admin?.permissions ?? []).not.toContain('orchestrator:audit:view')
    expect(member?.permissions ?? []).not.toContain('orchestrator:audit:view')
  })
})
