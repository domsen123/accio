import { sql } from 'drizzle-orm'
import { ulid } from 'ulid'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import * as schema from '../server/database/schema'
import {
  AiCredentialsMissingError,
  AiModelDisabledError,
  AiModelNotFoundError,
  AiNoDefaultModelError,
  AiProviderDisabledError,
  AiProviderUnsupportedError,
} from '../server/features/ai/errors'
import { createAiProviderService } from '../server/features/ai/provider'
import { getDatabase } from '../server/infrastructure/database/client'
import { encryptForOrg } from '../server/utils/crypto'

import { createOrganisationData } from './factories'

// ─── AI SDK mocks ───────────────────────────────────────────────────────────
//
// We need to assert that the provider builder hands the decrypted apiKey into
// the right SDK factory and then calls that factory with the provider-side
// model id. Mocking the three SDK packages keeps the test purely structural
// — no network, no env keys, no fixture API responses.
//
// `vi.mock` is hoisted to the top of the file by vitest, so the SDK packages
// are replaced before the `import { createAiProviderService }` above resolves
// them. The mock factories live inside `vi.hoisted` so they share identity
// between the hoisted vi.mock and the test-level assertions.

const mocks = vi.hoisted(() => {
  const anthropicCallable = vi.fn((modelId: string) => ({ provider: 'anthropic', modelId }))
  const openaiCallable = vi.fn((modelId: string) => ({ provider: 'openai', modelId }))
  const googleCallable = vi.fn((modelId: string) => ({ provider: 'google', modelId }))
  return {
    anthropicCallable,
    openaiCallable,
    googleCallable,
    createAnthropicMock: vi.fn(() => anthropicCallable),
    createOpenAIMock: vi.fn(() => openaiCallable),
    createGoogleMock: vi.fn(() => googleCallable),
  }
})

vi.mock('@ai-sdk/anthropic', () => ({
  createAnthropic: (opts: { apiKey: string }) => mocks.createAnthropicMock(opts),
}))

vi.mock('@ai-sdk/openai', () => ({
  createOpenAI: (opts: { apiKey: string }) => mocks.createOpenAIMock(opts),
}))

vi.mock('@ai-sdk/google', () => ({
  createGoogleGenerativeAI: (opts: { apiKey: string }) => mocks.createGoogleMock(opts),
}))

const { createAnthropicMock, createOpenAIMock, createGoogleMock, anthropicCallable, openaiCallable, googleCallable } = mocks

const db = getDatabase('app')
const aiProviderService = createAiProviderService({ db })

// AI tables aren't in the global afterEach TRUNCATE; clean explicitly.
const cleanAiTables = async () => {
  await db.execute(sql`TRUNCATE TABLE
    ai_provider_credentials,
    orchestrator_workspace_settings,
    ai_models,
    ai_providers
    CASCADE`)
}

interface ProviderFixture {
  id: string
  key: string
  models: Record<string, string> // modelCode -> ai_models.id
}

interface AiFixture {
  orgId: string
  cryptoSalt: string
  providers: {
    anthropic: ProviderFixture
    openai: ProviderFixture
    google: ProviderFixture
  }
  defaultGlobalModelId: string
  apiKey: string
}

const seedProvidersAndModels = async (): Promise<AiFixture['providers'] & { defaultGlobalModelId: string }> => {
  const anthropicId = ulid()
  const openaiId = ulid()
  const googleId = ulid()

  await db.insert(schema.aiProviders).values([
    { id: anthropicId, key: 'anthropic', displayName: 'Anthropic', sdkProviderId: 'anthropic', enabled: true },
    { id: openaiId, key: 'openai', displayName: 'OpenAI', sdkProviderId: 'openai', enabled: true },
    { id: googleId, key: 'google', displayName: 'Google', sdkProviderId: 'google', enabled: true },
  ])

  const anthropicSonnetId = ulid()
  const anthropicHaikuId = ulid()
  const openaiGptId = ulid()
  const googleGeminiId = ulid()

  await db.insert(schema.aiModels).values([
    {
      id: anthropicSonnetId,
      providerId: anthropicId,
      modelId: 'claude-sonnet-4-6',
      displayName: 'Claude Sonnet 4.6',
      contextWindow: 1_000_000,
      supportsTools: true,
      supportsStreaming: true,
      supportsVision: true,
      enabled: true,
      isDefault: true, // global default
    },
    {
      id: anthropicHaikuId,
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
      id: openaiGptId,
      providerId: openaiId,
      modelId: 'gpt-5.4',
      displayName: 'GPT-5.4',
      contextWindow: 1_050_000,
      supportsTools: true,
      supportsStreaming: true,
      supportsVision: true,
      enabled: true,
    },
    {
      id: googleGeminiId,
      providerId: googleId,
      modelId: 'gemini-2.5-pro',
      displayName: 'Gemini 2.5 Pro',
      contextWindow: 1_048_576,
      supportsTools: true,
      supportsStreaming: true,
      supportsVision: true,
      enabled: true,
    },
  ])

  return {
    anthropic: {
      id: anthropicId,
      key: 'anthropic',
      models: {
        'claude-sonnet-4-6': anthropicSonnetId,
        'claude-haiku-4-5': anthropicHaikuId,
      },
    },
    openai: {
      id: openaiId,
      key: 'openai',
      models: { 'gpt-5.4': openaiGptId },
    },
    google: {
      id: googleId,
      key: 'google',
      models: { 'gemini-2.5-pro': googleGeminiId },
    },
    defaultGlobalModelId: anthropicSonnetId,
  }
}

const setupFixture = async (): Promise<AiFixture> => {
  const orgData = createOrganisationData()
  const orgId = ulid()
  await db.insert(schema.organisations).values({
    id: orgId,
    name: orgData.name,
    slug: `${orgData.slug}-${orgId.slice(-6).toLowerCase()}`,
    cryptoSalt: orgData.cryptoSalt,
  })

  const seeded = await seedProvidersAndModels()
  const apiKey = 'sk-test-fixture-key-1234567890'

  // Insert credentials for all three providers (default).
  await db.insert(schema.aiProviderCredentials).values([
    {
      id: ulid(),
      organisationId: orgId,
      providerId: seeded.anthropic.id,
      apiKeyEncrypted: encryptForOrg(apiKey, orgData.cryptoSalt),
    },
    {
      id: ulid(),
      organisationId: orgId,
      providerId: seeded.openai.id,
      apiKeyEncrypted: encryptForOrg(apiKey, orgData.cryptoSalt),
    },
    {
      id: ulid(),
      organisationId: orgId,
      providerId: seeded.google.id,
      apiKeyEncrypted: encryptForOrg(apiKey, orgData.cryptoSalt),
    },
  ])

  return {
    orgId,
    cryptoSalt: orgData.cryptoSalt,
    providers: {
      anthropic: seeded.anthropic,
      openai: seeded.openai,
      google: seeded.google,
    },
    defaultGlobalModelId: seeded.defaultGlobalModelId,
    apiKey,
  }
}

describe('aiProviderService.resolveModelClient', () => {
  let fx: AiFixture

  beforeEach(async () => {
    await cleanAiTables()
    createAnthropicMock.mockClear()
    createOpenAIMock.mockClear()
    createGoogleMock.mockClear()
    anthropicCallable.mockClear()
    openaiCallable.mockClear()
    googleCallable.mockClear()
    fx = await setupFixture()
  })

  it('resolves an Anthropic model client with the decrypted api key', async () => {
    const result = await aiProviderService.resolveModelClient({
      organisationId: fx.orgId,
      modelId: fx.providers.anthropic.models['claude-sonnet-4-6']!,
    })

    expect(createAnthropicMock).toHaveBeenCalledTimes(1)
    expect(createAnthropicMock).toHaveBeenCalledWith({ apiKey: fx.apiKey })
    expect(anthropicCallable).toHaveBeenCalledWith('claude-sonnet-4-6')
    expect(result.providerKey).toBe('anthropic')
    expect(result.modelRow.modelId).toBe('claude-sonnet-4-6')
    expect(result.model).toEqual({ provider: 'anthropic', modelId: 'claude-sonnet-4-6' })
  })

  it('resolves an OpenAI model client', async () => {
    const result = await aiProviderService.resolveModelClient({
      organisationId: fx.orgId,
      modelId: fx.providers.openai.models['gpt-5.4']!,
    })

    expect(createOpenAIMock).toHaveBeenCalledWith({ apiKey: fx.apiKey })
    expect(openaiCallable).toHaveBeenCalledWith('gpt-5.4')
    expect(result.providerKey).toBe('openai')
    expect(result.model).toEqual({ provider: 'openai', modelId: 'gpt-5.4' })
  })

  it('resolves a Google model client', async () => {
    const result = await aiProviderService.resolveModelClient({
      organisationId: fx.orgId,
      modelId: fx.providers.google.models['gemini-2.5-pro']!,
    })

    expect(createGoogleMock).toHaveBeenCalledWith({ apiKey: fx.apiKey })
    expect(googleCallable).toHaveBeenCalledWith('gemini-2.5-pro')
    expect(result.providerKey).toBe('google')
    expect(result.model).toEqual({ provider: 'google', modelId: 'gemini-2.5-pro' })
  })

  it('does not cache: each call re-builds the SDK client', async () => {
    const args = {
      organisationId: fx.orgId,
      modelId: fx.providers.anthropic.models['claude-sonnet-4-6']!,
    }
    await aiProviderService.resolveModelClient(args)
    await aiProviderService.resolveModelClient(args)
    await aiProviderService.resolveModelClient(args)
    expect(createAnthropicMock).toHaveBeenCalledTimes(3)
  })

  it('throws AiModelNotFoundError for an unknown model id', async () => {
    await expect(
      aiProviderService.resolveModelClient({
        organisationId: fx.orgId,
        modelId: ulid(), // does not exist
      }),
    ).rejects.toBeInstanceOf(AiModelNotFoundError)
  })

  it('throws AiModelDisabledError when the model is disabled', async () => {
    // Disable the sonnet model.
    await db.execute(
      sql`UPDATE ai_models SET enabled = false WHERE id = ${fx.providers.anthropic.models['claude-sonnet-4-6']!}`,
    )

    await expect(
      aiProviderService.resolveModelClient({
        organisationId: fx.orgId,
        modelId: fx.providers.anthropic.models['claude-sonnet-4-6']!,
      }),
    ).rejects.toBeInstanceOf(AiModelDisabledError)
  })

  it('throws AiProviderDisabledError when the provider is globally disabled', async () => {
    await db.execute(
      sql`UPDATE ai_providers SET enabled = false WHERE id = ${fx.providers.anthropic.id}`,
    )

    await expect(
      aiProviderService.resolveModelClient({
        organisationId: fx.orgId,
        modelId: fx.providers.anthropic.models['claude-sonnet-4-6']!,
      }),
    ).rejects.toBeInstanceOf(AiProviderDisabledError)
  })

  it('throws AiCredentialsMissingError when the workspace has no credentials for the provider', async () => {
    // Drop the openai credential for this workspace.
    await db.execute(
      sql`DELETE FROM ai_provider_credentials WHERE organisation_id = ${fx.orgId} AND provider_id = ${fx.providers.openai.id}`,
    )

    await expect(
      aiProviderService.resolveModelClient({
        organisationId: fx.orgId,
        modelId: fx.providers.openai.models['gpt-5.4']!,
      }),
    ).rejects.toBeInstanceOf(AiCredentialsMissingError)
  })

  it('throws AiProviderUnsupportedError for an unrecognised provider key', async () => {
    // Insert a provider with an unknown key + a model under it + a credential.
    const unknownProviderId = ulid()
    const unknownModelId = ulid()
    const orgRow = await db
      .select({ cryptoSalt: schema.organisations.cryptoSalt })
      .from(schema.organisations)
      .where(sql`id = ${fx.orgId}`)
      .limit(1)
    const cryptoSalt = orgRow[0]!.cryptoSalt

    await db.insert(schema.aiProviders).values({
      id: unknownProviderId,
      key: 'mystery-provider',
      displayName: 'Mystery',
      sdkProviderId: 'mystery',
      enabled: true,
    })
    await db.insert(schema.aiModels).values({
      id: unknownModelId,
      providerId: unknownProviderId,
      modelId: 'whatever-1',
      displayName: 'Whatever',
      contextWindow: 100_000,
      supportsTools: true,
      supportsStreaming: true,
      supportsVision: false,
      enabled: true,
    })
    await db.insert(schema.aiProviderCredentials).values({
      id: ulid(),
      organisationId: fx.orgId,
      providerId: unknownProviderId,
      apiKeyEncrypted: encryptForOrg('sk-mystery', cryptoSalt),
    })

    await expect(
      aiProviderService.resolveModelClient({
        organisationId: fx.orgId,
        modelId: unknownModelId,
      }),
    ).rejects.toBeInstanceOf(AiProviderUnsupportedError)
  })
})

describe('aiProviderService.getDefaultModel', () => {
  let fx: AiFixture

  beforeEach(async () => {
    await cleanAiTables()
    fx = await setupFixture()
  })

  it('returns the workspace default when set and enabled', async () => {
    // Pin the haiku model as the workspace default.
    const haikuId = fx.providers.anthropic.models['claude-haiku-4-5']!
    await db.insert(schema.orchestratorWorkspaceSettings).values({
      organisationId: fx.orgId,
      defaultModelId: haikuId,
    })

    const result = await aiProviderService.getDefaultModel({ organisationId: fx.orgId })
    expect(result.id).toBe(haikuId)
    expect(result.modelId).toBe('claude-haiku-4-5')
  })

  it('falls back to the global default when no workspace setting row exists', async () => {
    const result = await aiProviderService.getDefaultModel({ organisationId: fx.orgId })
    expect(result.id).toBe(fx.defaultGlobalModelId)
    expect(result.isDefault).toBe(true)
  })

  it('falls back to the global default when the workspace pinned model is disabled', async () => {
    const haikuId = fx.providers.anthropic.models['claude-haiku-4-5']!
    await db.insert(schema.orchestratorWorkspaceSettings).values({
      organisationId: fx.orgId,
      defaultModelId: haikuId,
    })
    // Disable the workspace's pinned model — should fall through.
    await db.execute(sql`UPDATE ai_models SET enabled = false WHERE id = ${haikuId}`)

    const result = await aiProviderService.getDefaultModel({ organisationId: fx.orgId })
    expect(result.id).toBe(fx.defaultGlobalModelId)
  })

  it('throws AiNoDefaultModelError when no global default is enabled', async () => {
    // Strip the global default flag and make sure no enabled+default row remains.
    await db.execute(sql`UPDATE ai_models SET is_default = false`)

    await expect(
      aiProviderService.getDefaultModel({ organisationId: fx.orgId }),
    ).rejects.toBeInstanceOf(AiNoDefaultModelError)
  })
})
