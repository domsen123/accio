import type { LanguageModelV3 } from '@ai-sdk/provider'
import type { AiModel, AiProvider, AiProviderCredential, OrchestratorWorkspaceSettings } from '../../database/schema'
import type { DatabaseClient } from '../../infrastructure/database/client'
import { createAnthropic } from '@ai-sdk/anthropic'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { createOpenAI } from '@ai-sdk/openai'
import { and, asc, eq } from 'drizzle-orm'
import { ulid } from 'ulid'
import {
  aiModels,
  aiProviderCredentials,
  aiProviders,
  orchestratorWorkspaceSettings,
  organisations,
} from '../../database/schema'
import config from '../../utils/config'
import { decryptForOrg, encryptForOrg } from '../../utils/crypto'
import {
  AiCredentialsMissingError,
  AiModelDisabledError,
  AiModelNotFoundError,
  AiNoDefaultModelError,
  AiProviderDisabledError,
  AiProviderNotFoundError,
  AiProviderUnsupportedError,
  AiUniqueConflictError,
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

/**
 * Best-effort detection of a Postgres unique-violation error (SQLSTATE 23505).
 * Drizzle wraps the underlying pg-error in its own Error subclass and stashes
 * the original on `cause`, so we need to walk the cause chain. We can't
 * import the pg-error type without coupling to the driver, so we read the
 * standard `code` property defensively at every level.
 */
const isUniqueViolation = (err: unknown): boolean => {
  let current: unknown = err
  for (let depth = 0; current && depth < 5; depth += 1) {
    if (typeof current === 'object' && current !== null) {
      const code = (current as { code?: unknown }).code
      if (code === '23505')
        return true
      current = (current as { cause?: unknown }).cause
    }
    else {
      return false
    }
  }
  return false
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

  // ─── Provider / model registry queries (T-3.1e) ──────────────────────────

  /**
   * List providers. By default only `enabled = true` rows are returned, which
   * is what the workspace settings page wants. The admin model registry page
   * passes `includeDisabled: true` so super-admins can re-enable previously
   * disabled providers.
   */
  const listProviders = async (
    args: { includeDisabled?: boolean } = {},
  ): Promise<AiProvider[]> => {
    const baseQuery = db.select().from(aiProviders).orderBy(asc(aiProviders.displayName))
    if (args.includeDisabled) {
      return baseQuery
    }
    return db
      .select()
      .from(aiProviders)
      .where(eq(aiProviders.enabled, true))
      .orderBy(asc(aiProviders.displayName))
  }

  /**
   * List models with provider info. Defaults: enabled-only and any provider.
   * Admin views pass `includeDisabled: true` to see deprecated rows.
   */
  const listModels = async (
    args: { providerId?: string, includeDisabled?: boolean } = {},
  ): Promise<Array<AiModel & { providerKey: string, providerDisplayName: string, providerEnabled: boolean }>> => {
    const conditions = []
    if (args.providerId)
      conditions.push(eq(aiModels.providerId, args.providerId))
    if (!args.includeDisabled)
      conditions.push(eq(aiModels.enabled, true))

    const rows = await db
      .select({
        model: aiModels,
        providerKey: aiProviders.key,
        providerDisplayName: aiProviders.displayName,
        providerEnabled: aiProviders.enabled,
      })
      .from(aiModels)
      .innerJoin(aiProviders, eq(aiModels.providerId, aiProviders.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(asc(aiProviders.displayName), asc(aiModels.displayName))

    return rows.map(r => ({
      ...r.model,
      providerKey: r.providerKey,
      providerDisplayName: r.providerDisplayName,
      providerEnabled: r.providerEnabled,
    }))
  }

  /**
   * For each enabled provider, return whether the workspace has a credential
   * row. NEVER returns the encrypted blob, the plaintext, or anything else
   * that would let an attacker reconstruct the key (REQ-AI-2).
   */
  const listWorkspaceCredentialStatus = async (
    args: { organisationId: string, includeDisabled?: boolean },
  ): Promise<Array<{
    providerId: string
    providerKey: string
    providerDisplayName: string
    providerEnabled: boolean
    hasCredentials: boolean
    baseUrl: string | null
    updatedAt: Date | null
  }>> => {
    const providers = await listProviders({ includeDisabled: args.includeDisabled })

    if (providers.length === 0)
      return []

    const credentialRows = await db
      .select({
        providerId: aiProviderCredentials.providerId,
        baseUrl: aiProviderCredentials.baseUrl,
        updatedAt: aiProviderCredentials.updatedAt,
      })
      .from(aiProviderCredentials)
      .where(eq(aiProviderCredentials.organisationId, args.organisationId))

    const credentialByProvider = new Map(
      credentialRows.map(r => [r.providerId, r]),
    )

    return providers.map((p) => {
      const credential = credentialByProvider.get(p.id)
      return {
        providerId: p.id,
        providerKey: p.key,
        providerDisplayName: p.displayName,
        providerEnabled: p.enabled,
        hasCredentials: Boolean(credential),
        baseUrl: credential?.baseUrl ?? null,
        updatedAt: credential?.updatedAt ?? null,
      }
    })
  }

  const ensureProviderExists = async (providerId: string): Promise<AiProvider> => {
    const rows = await db
      .select()
      .from(aiProviders)
      .where(eq(aiProviders.id, providerId))
      .limit(1)
    const row = rows[0]
    if (!row)
      throw new AiProviderNotFoundError(providerId)
    return row
  }

  const getOrgCryptoSalt = async (organisationId: string): Promise<string> => {
    const orgRows = await db
      .select({ cryptoSalt: organisations.cryptoSalt })
      .from(organisations)
      .where(eq(organisations.id, organisationId))
      .limit(1)
    const org = orgRows[0]
    if (!org)
      throw new AiCredentialsMissingError(organisationId, 'unknown')
    return org.cryptoSalt
  }

  /**
   * Encrypt the supplied API key with `encryptForOrg` and upsert the
   * `(organisation_id, provider_id)` credential row. Plaintext never lands
   * in any column or log line — `encryptForOrg` is called inline.
   */
  const setWorkspaceCredentials = async (
    args: {
      organisationId: string
      providerId: string
      apiKey: string
      baseUrl?: string | null
      userId?: string | null
    },
  ): Promise<{ providerId: string, hasCredentials: true }> => {
    await ensureProviderExists(args.providerId)
    const salt = await getOrgCryptoSalt(args.organisationId)

    const encrypted = encryptForOrg(args.apiKey, salt)

    // Look up existing row to decide insert vs update — Drizzle's `onConflictDoUpdate`
    // exists but spelling out the two paths keeps the code obvious and avoids
    // a slightly awkward chained call.
    const existing = await db
      .select({ id: aiProviderCredentials.id })
      .from(aiProviderCredentials)
      .where(and(
        eq(aiProviderCredentials.organisationId, args.organisationId),
        eq(aiProviderCredentials.providerId, args.providerId),
      ))
      .limit(1)

    if (existing[0]) {
      await db
        .update(aiProviderCredentials)
        .set({
          apiKeyEncrypted: encrypted,
          baseUrl: args.baseUrl ?? null,
          updatedAt: new Date(),
        })
        .where(eq(aiProviderCredentials.id, existing[0].id))
    }
    else {
      try {
        await db.insert(aiProviderCredentials).values({
          id: ulid(),
          organisationId: args.organisationId,
          providerId: args.providerId,
          apiKeyEncrypted: encrypted,
          baseUrl: args.baseUrl ?? null,
          createdBy: args.userId ?? null,
        })
      }
      catch (err) {
        if (isUniqueViolation(err)) {
          throw new AiUniqueConflictError('credentials', {
            organisationId: args.organisationId,
            providerId: args.providerId,
          })
        }
        throw err
      }
    }

    return { providerId: args.providerId, hasCredentials: true }
  }

  const clearWorkspaceCredentials = async (
    args: { organisationId: string, providerId: string },
  ): Promise<void> => {
    await db
      .delete(aiProviderCredentials)
      .where(and(
        eq(aiProviderCredentials.organisationId, args.organisationId),
        eq(aiProviderCredentials.providerId, args.providerId),
      ))
  }

  /**
   * Read or create-on-read the workspace settings row. We initialise missing
   * rows with the platform default (`config.orchestrator.historyLimit`)
   * rather than the column default so the historyLimit env var actually
   * influences fresh workspaces.
   */
  const getWorkspaceSettings = async (
    args: { organisationId: string },
  ): Promise<OrchestratorWorkspaceSettings> => {
    const rows = await db
      .select()
      .from(orchestratorWorkspaceSettings)
      .where(eq(orchestratorWorkspaceSettings.organisationId, args.organisationId))
      .limit(1)
    const existing = rows[0]
    if (existing)
      return existing

    const defaultHistoryLimit = config.orchestrator.historyLimit
    const inserted = await db
      .insert(orchestratorWorkspaceSettings)
      .values({
        organisationId: args.organisationId,
        historyLimit: defaultHistoryLimit,
      })
      .returning()
    return inserted[0]!
  }

  /**
   * Partial update of workspace settings. If `defaultModelId` is provided, we
   * first verify the target model exists and is enabled (REQ-AI-4: pickers
   * scope to enabled models). Passing `null` clears the workspace default and
   * falls back to the platform global default.
   */
  const setWorkspaceSettings = async (
    args: {
      organisationId: string
      defaultModelId?: string | null
      aiDisplayName?: string
      historyLimit?: number
      systemPrompt?: string | null
    },
  ): Promise<OrchestratorWorkspaceSettings> => {
    if (args.defaultModelId !== undefined && args.defaultModelId !== null) {
      const modelRows = await db
        .select()
        .from(aiModels)
        .where(eq(aiModels.id, args.defaultModelId))
        .limit(1)
      const model = modelRows[0]
      if (!model)
        throw new AiModelNotFoundError(args.defaultModelId)
      if (!model.enabled)
        throw new AiModelDisabledError(args.defaultModelId)
    }

    // Make sure the row exists first.
    await getWorkspaceSettings({ organisationId: args.organisationId })

    const patch: Partial<OrchestratorWorkspaceSettings> = { updatedAt: new Date() }
    if (args.defaultModelId !== undefined)
      patch.defaultModelId = args.defaultModelId
    if (args.aiDisplayName !== undefined)
      patch.aiDisplayName = args.aiDisplayName
    if (args.historyLimit !== undefined)
      patch.historyLimit = args.historyLimit
    if (args.systemPrompt !== undefined)
      patch.systemPrompt = args.systemPrompt

    const updated = await db
      .update(orchestratorWorkspaceSettings)
      .set(patch)
      .where(eq(orchestratorWorkspaceSettings.organisationId, args.organisationId))
      .returning()

    return updated[0]!
  }

  // ─── Admin model registry CRUD (T-3.1e) ──────────────────────────────────

  /**
   * Create a model row. If `isDefault: true`, unset the previous default in
   * the same transaction so the `is_default = true` invariant (one row at a
   * time) holds.
   */
  const createModel = async (
    args: {
      providerId: string
      modelId: string
      displayName: string
      contextWindow: number
      supportsTools?: boolean
      supportsStreaming?: boolean
      supportsVision?: boolean
      inputPricePerMtok?: string | null
      outputPricePerMtok?: string | null
      enabled?: boolean
      isDefault?: boolean
    },
  ): Promise<AiModel> => {
    await ensureProviderExists(args.providerId)

    return db.transaction(async (tx) => {
      if (args.isDefault) {
        await tx
          .update(aiModels)
          .set({ isDefault: false, updatedAt: new Date() })
          .where(eq(aiModels.isDefault, true))
      }

      try {
        const inserted = await tx
          .insert(aiModels)
          .values({
            id: ulid(),
            providerId: args.providerId,
            modelId: args.modelId,
            displayName: args.displayName,
            contextWindow: args.contextWindow,
            supportsTools: args.supportsTools ?? false,
            supportsStreaming: args.supportsStreaming ?? false,
            supportsVision: args.supportsVision ?? false,
            inputPricePerMtok: args.inputPricePerMtok ?? null,
            outputPricePerMtok: args.outputPricePerMtok ?? null,
            enabled: args.enabled ?? true,
            isDefault: args.isDefault ?? false,
          })
          .returning()
        return inserted[0]!
      }
      catch (err) {
        if (isUniqueViolation(err)) {
          throw new AiUniqueConflictError('model', {
            providerId: args.providerId,
            modelId: args.modelId,
          })
        }
        throw err
      }
    })
  }

  const updateModel = async (
    id: string,
    patch: {
      modelId?: string
      displayName?: string
      contextWindow?: number
      supportsTools?: boolean
      supportsStreaming?: boolean
      supportsVision?: boolean
      inputPricePerMtok?: string | null
      outputPricePerMtok?: string | null
      enabled?: boolean
      isDefault?: boolean
    },
  ): Promise<AiModel> => {
    return db.transaction(async (tx) => {
      const existing = await tx
        .select()
        .from(aiModels)
        .where(eq(aiModels.id, id))
        .limit(1)
      const current = existing[0]
      if (!current)
        throw new AiModelNotFoundError(id)

      if (patch.isDefault === true && !current.isDefault) {
        await tx
          .update(aiModels)
          .set({ isDefault: false, updatedAt: new Date() })
          .where(eq(aiModels.isDefault, true))
      }

      const update: Partial<AiModel> = { updatedAt: new Date() }
      if (patch.modelId !== undefined)
        update.modelId = patch.modelId
      if (patch.displayName !== undefined)
        update.displayName = patch.displayName
      if (patch.contextWindow !== undefined)
        update.contextWindow = patch.contextWindow
      if (patch.supportsTools !== undefined)
        update.supportsTools = patch.supportsTools
      if (patch.supportsStreaming !== undefined)
        update.supportsStreaming = patch.supportsStreaming
      if (patch.supportsVision !== undefined)
        update.supportsVision = patch.supportsVision
      if (patch.inputPricePerMtok !== undefined)
        update.inputPricePerMtok = patch.inputPricePerMtok
      if (patch.outputPricePerMtok !== undefined)
        update.outputPricePerMtok = patch.outputPricePerMtok
      if (patch.enabled !== undefined)
        update.enabled = patch.enabled
      if (patch.isDefault !== undefined)
        update.isDefault = patch.isDefault

      try {
        const updated = await tx
          .update(aiModels)
          .set(update)
          .where(eq(aiModels.id, id))
          .returning()
        return updated[0]!
      }
      catch (err) {
        if (isUniqueViolation(err)) {
          throw new AiUniqueConflictError('model', { id, modelId: patch.modelId })
        }
        throw err
      }
    })
  }

  const deleteModel = async (id: string): Promise<void> => {
    const existing = await db
      .select()
      .from(aiModels)
      .where(eq(aiModels.id, id))
      .limit(1)
    if (!existing[0])
      throw new AiModelNotFoundError(id)
    await db.delete(aiModels).where(eq(aiModels.id, id))
  }

  /**
   * Toggle an entire provider on/off. Disabling a provider hides every model
   * that lives under it from the picker (resolveModelClient throws
   * `AiProviderDisabledError`). The row stays around — credentials and
   * historical action logs keep their FKs.
   */
  const updateProvider = async (
    id: string,
    patch: { enabled: boolean },
  ): Promise<AiProvider> => {
    const existing = await ensureProviderExists(id)
    if (existing.enabled === patch.enabled)
      return existing
    const updated = await db
      .update(aiProviders)
      .set({ enabled: patch.enabled, updatedAt: new Date() })
      .where(eq(aiProviders.id, id))
      .returning()
    return updated[0]!
  }

  return {
    resolveModelClient,
    getDefaultModel,
    listProviders,
    listModels,
    listWorkspaceCredentialStatus,
    setWorkspaceCredentials,
    clearWorkspaceCredentials,
    getWorkspaceSettings,
    setWorkspaceSettings,
    createModel,
    updateModel,
    deleteModel,
    updateProvider,
  }
}

export type AiProviderService = ReturnType<typeof createAiProviderService>

// Re-export the credential row type so the API layer can describe its
// `setWorkspaceCredentials` return without importing from the schema directly.
export type { AiProviderCredential }
