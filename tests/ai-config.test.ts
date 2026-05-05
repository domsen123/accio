/**
 * Service-level tests for the AI Configuration surface (T-3.1e).
 *
 * Covers:
 *   - Round-trip credential save/clear: encrypted blob isn't the plaintext;
 *     `decryptForOrg` recovers it.
 *   - Workspace settings: read creates a row with platform defaults; partial
 *     update accepts a valid model; rejects an unknown model id; rejects a
 *     disabled model id.
 *   - Default-model toggle in the admin model registry: setting `is_default`
 *     on a new row unsets the previous default in the same transaction.
 *   - Listing helpers respect `enabled` and `includeDisabled`.
 *
 * The SDK packages are mocked the same way as `tests/ai-provider.test.ts`
 * (those tests import the same module that pulls in `@ai-sdk/*`).
 */
import { sql } from 'drizzle-orm'
import { ulid } from 'ulid'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import * as schema from '../server/database/schema'
import {
  AiModelDisabledError,
  AiModelNotFoundError,
  AiUniqueConflictError,
} from '../server/features/ai/errors'
import { createAiProviderService } from '../server/features/ai/provider'
import { getDatabase } from '../server/infrastructure/database/client'
import { decryptForOrg } from '../server/utils/crypto'

import { createOrganisationData } from './factories'

vi.mock('@ai-sdk/anthropic', () => ({
  createAnthropic: () => () => ({}),
}))
vi.mock('@ai-sdk/openai', () => ({
  createOpenAI: () => () => ({}),
}))
vi.mock('@ai-sdk/google', () => ({
  createGoogleGenerativeAI: () => () => ({}),
}))

const db = getDatabase('app')
const aiProviderService = createAiProviderService({ db })

const cleanAiTables = async () => {
  await db.execute(sql`TRUNCATE TABLE
    ai_provider_credentials,
    orchestrator_workspace_settings,
    ai_models,
    ai_providers
    CASCADE`)
}

interface Fixture {
  orgId: string
  cryptoSalt: string
  providerIds: { anthropic: string, openai: string, google: string }
  modelIds: {
    anthropicSonnet: string
    anthropicHaiku: string
    openaiGpt: string
  }
}

const setupFixture = async (): Promise<Fixture> => {
  const orgData = createOrganisationData()
  const orgId = ulid()
  await db.insert(schema.organisations).values({
    id: orgId,
    name: orgData.name,
    slug: `${orgData.slug}-${orgId.slice(-6).toLowerCase()}`,
    cryptoSalt: orgData.cryptoSalt,
  })

  const anthropicId = ulid()
  const openaiId = ulid()
  const googleId = ulid()
  await db.insert(schema.aiProviders).values([
    { id: anthropicId, key: 'anthropic', displayName: 'Anthropic', sdkProviderId: 'anthropic', enabled: true },
    { id: openaiId, key: 'openai', displayName: 'OpenAI', sdkProviderId: 'openai', enabled: true },
    { id: googleId, key: 'google', displayName: 'Google', sdkProviderId: 'google', enabled: true },
  ])

  const sonnetId = ulid()
  const haikuId = ulid()
  const gptId = ulid()
  await db.insert(schema.aiModels).values([
    {
      id: sonnetId,
      providerId: anthropicId,
      modelId: 'claude-sonnet-4-6',
      displayName: 'Claude Sonnet 4.6',
      contextWindow: 1_000_000,
      supportsTools: true,
      supportsStreaming: true,
      supportsVision: true,
      enabled: true,
      isDefault: true,
    },
    {
      id: haikuId,
      providerId: anthropicId,
      modelId: 'claude-haiku-4-5',
      displayName: 'Claude Haiku 4.5',
      contextWindow: 200_000,
      supportsTools: true,
      supportsStreaming: true,
      supportsVision: true,
      enabled: true,
    },
    {
      id: gptId,
      providerId: openaiId,
      modelId: 'gpt-5.4',
      displayName: 'GPT-5.4',
      contextWindow: 1_050_000,
      supportsTools: true,
      supportsStreaming: true,
      supportsVision: true,
      enabled: true,
    },
  ])

  return {
    orgId,
    cryptoSalt: orgData.cryptoSalt,
    providerIds: { anthropic: anthropicId, openai: openaiId, google: googleId },
    modelIds: {
      anthropicSonnet: sonnetId,
      anthropicHaiku: haikuId,
      openaiGpt: gptId,
    },
  }
}

describe('aiProviderService.setWorkspaceCredentials', () => {
  let fx: Fixture

  beforeEach(async () => {
    await cleanAiTables()
    fx = await setupFixture()
  })

  it('encrypts the api key, never stores plaintext, and decryptForOrg recovers it', async () => {
    const apiKey = 'sk-test-fixture-key-1234567890'

    await aiProviderService.setWorkspaceCredentials({
      organisationId: fx.orgId,
      providerId: fx.providerIds.anthropic,
      apiKey,
    })

    const rows = await db
      .select()
      .from(schema.aiProviderCredentials)
      .where(sql`organisation_id = ${fx.orgId} AND provider_id = ${fx.providerIds.anthropic}`)
      .limit(1)

    const row = rows[0]
    expect(row).toBeTruthy()
    // Crucial: the stored blob must not be the plaintext.
    expect(row!.apiKeyEncrypted).not.toBe(apiKey)
    expect(row!.apiKeyEncrypted).not.toContain(apiKey)
    // …and decryptForOrg must recover the exact plaintext given the org salt.
    expect(decryptForOrg(row!.apiKeyEncrypted, fx.cryptoSalt)).toBe(apiKey)
  })

  it('upsert: re-saving for the same provider replaces the row in place', async () => {
    await aiProviderService.setWorkspaceCredentials({
      organisationId: fx.orgId,
      providerId: fx.providerIds.anthropic,
      apiKey: 'first-key',
    })
    await aiProviderService.setWorkspaceCredentials({
      organisationId: fx.orgId,
      providerId: fx.providerIds.anthropic,
      apiKey: 'second-key',
    })

    const rows = await db
      .select()
      .from(schema.aiProviderCredentials)
      .where(sql`organisation_id = ${fx.orgId} AND provider_id = ${fx.providerIds.anthropic}`)

    expect(rows).toHaveLength(1)
    expect(decryptForOrg(rows[0]!.apiKeyEncrypted, fx.cryptoSalt)).toBe('second-key')
  })

  it('listWorkspaceCredentialStatus reflects per-provider state without leaking the key', async () => {
    await aiProviderService.setWorkspaceCredentials({
      organisationId: fx.orgId,
      providerId: fx.providerIds.anthropic,
      apiKey: 'sk-anthropic-only',
    })

    const statuses = await aiProviderService.listWorkspaceCredentialStatus({
      organisationId: fx.orgId,
    })

    const byKey = Object.fromEntries(statuses.map(s => [s.providerKey, s]))
    expect(byKey.anthropic?.hasCredentials).toBe(true)
    expect(byKey.openai?.hasCredentials).toBe(false)
    expect(byKey.google?.hasCredentials).toBe(false)
    // Make sure the response shape never carries an encrypted blob or key.
    for (const s of statuses) {
      expect(JSON.stringify(s)).not.toContain('sk-anthropic-only')
      expect(JSON.stringify(s)).not.toContain('apiKeyEncrypted')
    }
  })

  it('clearWorkspaceCredentials removes the row', async () => {
    await aiProviderService.setWorkspaceCredentials({
      organisationId: fx.orgId,
      providerId: fx.providerIds.anthropic,
      apiKey: 'sk-x',
    })
    await aiProviderService.clearWorkspaceCredentials({
      organisationId: fx.orgId,
      providerId: fx.providerIds.anthropic,
    })

    const rows = await db
      .select()
      .from(schema.aiProviderCredentials)
      .where(sql`organisation_id = ${fx.orgId} AND provider_id = ${fx.providerIds.anthropic}`)
    expect(rows).toHaveLength(0)
  })
})

describe('aiProviderService.setWorkspaceSettings', () => {
  let fx: Fixture

  beforeEach(async () => {
    await cleanAiTables()
    fx = await setupFixture()
  })

  it('getWorkspaceSettings creates the row on first read with platform defaults', async () => {
    const settings = await aiProviderService.getWorkspaceSettings({
      organisationId: fx.orgId,
    })
    expect(settings.organisationId).toBe(fx.orgId)
    expect(settings.aiDisplayName).toBe('Claude-Orchestrator')
    expect(settings.historyLimit).toBeGreaterThan(0)
  })

  it('accepts a valid enabled model id', async () => {
    const settings = await aiProviderService.setWorkspaceSettings({
      organisationId: fx.orgId,
      defaultModelId: fx.modelIds.anthropicHaiku,
      aiDisplayName: 'Aria',
      historyLimit: 50,
    })
    expect(settings.defaultModelId).toBe(fx.modelIds.anthropicHaiku)
    expect(settings.aiDisplayName).toBe('Aria')
    expect(settings.historyLimit).toBe(50)
  })

  it('rejects an unknown model id', async () => {
    await expect(
      aiProviderService.setWorkspaceSettings({
        organisationId: fx.orgId,
        defaultModelId: ulid(),
      }),
    ).rejects.toBeInstanceOf(AiModelNotFoundError)
  })

  it('rejects a disabled model id', async () => {
    await db.execute(sql`UPDATE ai_models SET enabled = false WHERE id = ${fx.modelIds.anthropicHaiku}`)
    await expect(
      aiProviderService.setWorkspaceSettings({
        organisationId: fx.orgId,
        defaultModelId: fx.modelIds.anthropicHaiku,
      }),
    ).rejects.toBeInstanceOf(AiModelDisabledError)
  })
})

describe('aiProviderService model registry CRUD', () => {
  let fx: Fixture

  beforeEach(async () => {
    await cleanAiTables()
    fx = await setupFixture()
  })

  it('setting is_default=true on a new row unsets the previously default row in the same transaction', async () => {
    // Sanity: sonnet starts as the default.
    const before = await db
      .select()
      .from(schema.aiModels)
      .where(sql`is_default = true`)
    expect(before).toHaveLength(1)
    expect(before[0]!.id).toBe(fx.modelIds.anthropicSonnet)

    const created = await aiProviderService.createModel({
      providerId: fx.providerIds.openai,
      modelId: 'gpt-9-test',
      displayName: 'Test GPT-9',
      contextWindow: 128_000,
      supportsTools: true,
      supportsStreaming: true,
      isDefault: true,
    })

    expect(created.isDefault).toBe(true)

    const after = await db
      .select()
      .from(schema.aiModels)
      .where(sql`is_default = true`)
    expect(after).toHaveLength(1)
    expect(after[0]!.id).toBe(created.id)

    // Sonnet was unset.
    const sonnetRows = await db
      .select()
      .from(schema.aiModels)
      .where(sql`id = ${fx.modelIds.anthropicSonnet}`)
    expect(sonnetRows[0]!.isDefault).toBe(false)
  })

  it('updating is_default=true on model B unsets the previously default model A', async () => {
    // Sanity: sonnet starts as the default.
    const haikuBefore = await db
      .select()
      .from(schema.aiModels)
      .where(sql`id = ${fx.modelIds.anthropicHaiku}`)
    expect(haikuBefore[0]!.isDefault).toBe(false)

    await aiProviderService.updateModel(fx.modelIds.anthropicHaiku, { isDefault: true })

    const haikuAfter = await db
      .select()
      .from(schema.aiModels)
      .where(sql`id = ${fx.modelIds.anthropicHaiku}`)
    const sonnetAfter = await db
      .select()
      .from(schema.aiModels)
      .where(sql`id = ${fx.modelIds.anthropicSonnet}`)

    expect(haikuAfter[0]!.isDefault).toBe(true)
    expect(sonnetAfter[0]!.isDefault).toBe(false)
  })

  it('createModel rejects duplicates on (provider_id, model_id)', async () => {
    await expect(
      aiProviderService.createModel({
        providerId: fx.providerIds.anthropic,
        modelId: 'claude-sonnet-4-6', // already exists
        displayName: 'Conflicting',
        contextWindow: 1_000_000,
      }),
    ).rejects.toBeInstanceOf(AiUniqueConflictError)
  })

  it('listProviders defaults to enabled-only and accepts includeDisabled', async () => {
    await db.execute(sql`UPDATE ai_providers SET enabled = false WHERE id = ${fx.providerIds.google}`)

    const enabledOnly = await aiProviderService.listProviders()
    expect(enabledOnly.map(p => p.key).sort()).toEqual(['anthropic', 'openai'])

    const all = await aiProviderService.listProviders({ includeDisabled: true })
    expect(all.map(p => p.key).sort()).toEqual(['anthropic', 'google', 'openai'])
  })

  it('listModels defaults to enabled-only and includes provider info', async () => {
    await db.execute(sql`UPDATE ai_models SET enabled = false WHERE id = ${fx.modelIds.openaiGpt}`)

    const enabledOnly = await aiProviderService.listModels()
    expect(enabledOnly.map(m => m.modelId).sort()).toEqual(['claude-haiku-4-5', 'claude-sonnet-4-6'])
    expect(enabledOnly.every(m => typeof m.providerKey === 'string')).toBe(true)

    const includeDisabled = await aiProviderService.listModels({ includeDisabled: true })
    expect(includeDisabled.map(m => m.modelId).sort()).toEqual([
      'claude-haiku-4-5',
      'claude-sonnet-4-6',
      'gpt-5.4',
    ])
  })

  it('deleteModel removes a row', async () => {
    await aiProviderService.deleteModel(fx.modelIds.anthropicHaiku)
    const rows = await db
      .select()
      .from(schema.aiModels)
      .where(sql`id = ${fx.modelIds.anthropicHaiku}`)
    expect(rows).toHaveLength(0)
  })
})
