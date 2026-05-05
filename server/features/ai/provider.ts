import type { LanguageModelV3 } from '@ai-sdk/provider'
import type { AiModel } from '../../database/schema'
import type { DatabaseClient } from '../../infrastructure/database/client'
import { createAnthropic } from '@ai-sdk/anthropic'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { createOpenAI } from '@ai-sdk/openai'
import { and, eq } from 'drizzle-orm'
import {
  aiModels,
  aiProviderCredentials,
  aiProviders,
  orchestratorWorkspaceSettings,
  organisations,
} from '../../database/schema'
import { decryptForOrg } from '../../utils/crypto'
import {
  AiCredentialsMissingError,
  AiModelDisabledError,
  AiModelNotFoundError,
  AiNoDefaultModelError,
  AiProviderDisabledError,
  AiProviderUnsupportedError,
} from './errors'

// ─── AI provider client builder (T-3.1d) ────────────────────────────────────
//
// Refs: DESIGN-AI §Provider-Model resolution flow, ADR-013 (Vercel AI SDK),
// ADR-014 (encrypted creds in DB).
//
// Responsibilities:
//   1. Resolve a `model_id` to its `ai_models` row + provider.
//   2. Fetch and decrypt the active workspace's API key for that provider.
//   3. Construct a fresh AI SDK provider client and return the LanguageModelV3
//      instance keyed by the provider-side model id (e.g. `claude-sonnet-4-6`).
//
// IMPORTANT — the resolution flow MUST NOT cache the provider client across
// requests. DESIGN-AI calls this out explicitly: caching invites stale-key
// bugs after a credential rotation, and the construction cost is negligible.
// Every call to `resolveModelClient` re-reads the DB and re-builds the SDK
// instance on the spot.

export interface AiProviderServiceDeps {
  db: DatabaseClient
}

export interface ResolveModelClientArgs {
  organisationId: string
  modelId: string
}

export interface GetDefaultModelArgs {
  organisationId: string
}

export interface ResolvedModelClient {
  /** The fully-built SDK model instance, ready to pass to `streamText`/`generateText`. */
  model: LanguageModelV3
  /** The `ai_models` row that produced the client. */
  modelRow: AiModel
  /** Stable provider key (e.g. `anthropic`, `openai`, `google`). */
  providerKey: string
}

const buildProviderClient = (providerKey: string, modelCode: string, apiKey: string): LanguageModelV3 => {
  switch (providerKey) {
    case 'anthropic': {
      const provider = createAnthropic({ apiKey })
      return provider(modelCode as Parameters<typeof provider>[0])
    }
    case 'openai': {
      const provider = createOpenAI({ apiKey })
      return provider(modelCode as Parameters<typeof provider>[0])
    }
    case 'google': {
      const provider = createGoogleGenerativeAI({ apiKey })
      return provider(modelCode as Parameters<typeof provider>[0])
    }
    default:
      throw new AiProviderUnsupportedError(providerKey)
  }
}

export const createAiProviderService = (deps: AiProviderServiceDeps) => {
  const { db } = deps

  /**
   * Build a fresh AI SDK model client for the given `(organisationId, modelId)`.
   *
   * No caching: the DB is queried on every call so that key rotations and
   * provider toggles take effect immediately. See DESIGN-AI §Provider-Model
   * resolution flow.
   */
  const resolveModelClient = async (args: ResolveModelClientArgs): Promise<ResolvedModelClient> => {
    const { organisationId, modelId } = args

    // 1. Load model + provider in one round trip.
    const modelRows = await db
      .select({ model: aiModels, provider: aiProviders })
      .from(aiModels)
      .innerJoin(aiProviders, eq(aiModels.providerId, aiProviders.id))
      .where(eq(aiModels.id, modelId))
      .limit(1)

    const row = modelRows[0]
    if (!row) {
      throw new AiModelNotFoundError(modelId)
    }

    const { model, provider } = row

    if (!model.enabled) {
      throw new AiModelDisabledError(modelId)
    }
    if (!provider.enabled) {
      throw new AiProviderDisabledError(provider.key)
    }

    // 2. Load credentials for the workspace + provider.
    const credentialRows = await db
      .select()
      .from(aiProviderCredentials)
      .where(and(
        eq(aiProviderCredentials.organisationId, organisationId),
        eq(aiProviderCredentials.providerId, provider.id),
      ))
      .limit(1)

    const credential = credentialRows[0]
    if (!credential) {
      throw new AiCredentialsMissingError(organisationId, provider.key)
    }

    // 3. Look up the org's crypto salt and decrypt the API key.
    const orgRows = await db
      .select({ cryptoSalt: organisations.cryptoSalt })
      .from(organisations)
      .where(eq(organisations.id, organisationId))
      .limit(1)

    const org = orgRows[0]
    if (!org) {
      // The credential row's FK to organisations means this should be unreachable
      // unless something deleted the org mid-flight. Treat as missing creds.
      throw new AiCredentialsMissingError(organisationId, provider.key)
    }

    const apiKey = decryptForOrg(credential.apiKeyEncrypted, org.cryptoSalt)

    // 4. Build the SDK client. Switch is in a helper so that the
    //    `AiProviderUnsupportedError` path is testable in isolation.
    const sdkModel = buildProviderClient(provider.key, model.modelId, apiKey)

    return {
      model: sdkModel,
      modelRow: model,
      providerKey: provider.key,
    }
  }

  /**
   * Return the default `ai_models` row for the workspace.
   *
   * Fallback chain (DESIGN-AI §Provider-Model resolution flow):
   *   1. `orchestrator_workspace_settings.default_model_id` if set and the
   *      target model is enabled.
   *   2. The platform-global model with `is_default = true` (and enabled).
   *   3. Throws `AiNoDefaultModelError`.
   *
   * Note: `getDefaultModel` ONLY resolves the model row — it does not build
   * the SDK client. Call `resolveModelClient({ organisationId, modelId })` on
   * the returned `id` if you need a ready-to-use client.
   */
  const getDefaultModel = async (args: GetDefaultModelArgs): Promise<AiModel> => {
    const { organisationId } = args

    // 1. Workspace setting wins if it points to an enabled model.
    const settingRows = await db
      .select({ defaultModelId: orchestratorWorkspaceSettings.defaultModelId })
      .from(orchestratorWorkspaceSettings)
      .where(eq(orchestratorWorkspaceSettings.organisationId, organisationId))
      .limit(1)

    const workspaceDefaultId = settingRows[0]?.defaultModelId ?? null
    if (workspaceDefaultId) {
      const rows = await db
        .select()
        .from(aiModels)
        .where(eq(aiModels.id, workspaceDefaultId))
        .limit(1)
      const candidate = rows[0]
      if (candidate && candidate.enabled) {
        return candidate
      }
      // Fall through if the workspace pointed at a disabled or removed model.
    }

    // 2. Global default.
    const globalRows = await db
      .select()
      .from(aiModels)
      .where(and(
        eq(aiModels.isDefault, true),
        eq(aiModels.enabled, true),
      ))
      .limit(1)

    const globalDefault = globalRows[0]
    if (globalDefault) {
      return globalDefault
    }

    throw new AiNoDefaultModelError(organisationId)
  }

  return {
    resolveModelClient,
    getDefaultModel,
  }
}

export type AiProviderService = ReturnType<typeof createAiProviderService>
