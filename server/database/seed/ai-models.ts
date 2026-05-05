import type { DatabaseClient } from '../../infrastructure/database/client'
import { and, eq } from 'drizzle-orm'
import { ulid } from 'ulid'
import { aiModels, aiProviders } from '../schema'

// ─── AI providers + models seed ──────────────────────────────────────────────
//
// Refs: DESIGN-AI §Seed data, REQ-AI-1, REQ-AI-3.
//
// This file is the curated starting registry of AI providers and frontier
// models. It is **expected to evolve over time** as providers ship new models
// and deprecate old ones — feel free to hand-edit this file to add new rows.
// Existing rows are NEVER mutated by the seed (idempotent insert-if-missing
// only); admins manage the registry from the admin UI (REQ-AI-3) once a row
// exists.
//
// Model IDs verified against provider docs as of May 2026:
//   - Anthropic:  https://platform.claude.com/docs/en/about-claude/models/overview
//   - OpenAI:     https://developers.openai.com/api/docs/models
//   - Google:     https://ai.google.dev/gemini-api/docs/models
//
// Default model: Anthropic `claude-sonnet-4-6` (best speed/intelligence balance,
// supports tools + streaming, 1M context). Exactly one row carries
// `is_default = true`, per REQ-AI-4 and the unique fallback semantics in
// DESIGN-AI §Provider-Model resolution flow.

interface ProviderSeed {
  key: string
  displayName: string
  sdkProviderId: string
}

interface ModelSeed {
  providerKey: string
  modelId: string
  displayName: string
  contextWindow: number
  supportsTools: boolean
  supportsStreaming: boolean
  supportsVision: boolean
  inputPricePerMtok?: string
  outputPricePerMtok?: string
  isDefault?: boolean
}

const PROVIDERS: ProviderSeed[] = [
  { key: 'anthropic', displayName: 'Anthropic', sdkProviderId: 'anthropic' },
  { key: 'openai', displayName: 'OpenAI', sdkProviderId: 'openai' },
  { key: 'google', displayName: 'Google', sdkProviderId: 'google' },
]

// Pricing is in USD per 1M tokens (numeric(10,4)). Stored as a string because
// drizzle's numeric type round-trips as string to preserve precision.
const MODELS: ModelSeed[] = [
  // ─── Anthropic ─────────────────────────────────────────────────────────────
  {
    providerKey: 'anthropic',
    modelId: 'claude-opus-4-7',
    displayName: 'Claude Opus 4.7',
    contextWindow: 1_000_000,
    supportsTools: true,
    supportsStreaming: true,
    supportsVision: true,
    inputPricePerMtok: '5.0000',
    outputPricePerMtok: '25.0000',
  },
  {
    providerKey: 'anthropic',
    modelId: 'claude-sonnet-4-6',
    displayName: 'Claude Sonnet 4.6',
    contextWindow: 1_000_000,
    supportsTools: true,
    supportsStreaming: true,
    supportsVision: true,
    inputPricePerMtok: '3.0000',
    outputPricePerMtok: '15.0000',
    isDefault: true,
  },
  {
    providerKey: 'anthropic',
    modelId: 'claude-haiku-4-5',
    displayName: 'Claude Haiku 4.5',
    contextWindow: 200_000,
    supportsTools: true,
    supportsStreaming: true,
    supportsVision: true,
    inputPricePerMtok: '1.0000',
    outputPricePerMtok: '5.0000',
  },

  // ─── OpenAI ────────────────────────────────────────────────────────────────
  {
    providerKey: 'openai',
    modelId: 'gpt-5.5',
    displayName: 'GPT-5.5',
    contextWindow: 1_050_000,
    supportsTools: true,
    supportsStreaming: true,
    supportsVision: true,
  },
  {
    providerKey: 'openai',
    modelId: 'gpt-5.4',
    displayName: 'GPT-5.4',
    contextWindow: 1_050_000,
    supportsTools: true,
    supportsStreaming: true,
    supportsVision: true,
  },
  {
    providerKey: 'openai',
    modelId: 'gpt-5.4-mini',
    displayName: 'GPT-5.4 mini',
    contextWindow: 1_050_000,
    supportsTools: true,
    supportsStreaming: true,
    supportsVision: true,
  },

  // ─── Google ────────────────────────────────────────────────────────────────
  {
    providerKey: 'google',
    modelId: 'gemini-3.1-pro',
    displayName: 'Gemini 3.1 Pro',
    contextWindow: 1_048_576,
    supportsTools: true,
    supportsStreaming: true,
    supportsVision: true,
  },
  {
    providerKey: 'google',
    modelId: 'gemini-2.5-pro',
    displayName: 'Gemini 2.5 Pro',
    contextWindow: 1_048_576,
    supportsTools: true,
    supportsStreaming: true,
    supportsVision: true,
  },
  {
    providerKey: 'google',
    modelId: 'gemini-2.5-flash',
    displayName: 'Gemini 2.5 Flash',
    contextWindow: 1_048_576,
    supportsTools: true,
    supportsStreaming: true,
    supportsVision: true,
  },
]

export interface SeedAiProvidersAndModelsDeps {
  db: DatabaseClient
}

/**
 * Seed AI providers and the curated initial model registry.
 *
 * Idempotent:
 *   - Providers are matched by `key`; existing rows are left untouched.
 *   - Models are matched by `(provider_id, model_id)`; existing rows are left
 *     untouched (admins manage further changes via the admin UI).
 *
 * Safe to run on every boot.
 */
export const seedAiProvidersAndModels = async (deps: SeedAiProvidersAndModelsDeps): Promise<void> => {
  const { db } = deps

  // ─── Providers ──────────────────────────────────────────────────────────────
  const providerIdByKey = new Map<string, string>()

  for (const provider of PROVIDERS) {
    const existing = await db
      .select()
      .from(aiProviders)
      .where(eq(aiProviders.key, provider.key))
      .limit(1)

    if (existing.length > 0) {
      providerIdByKey.set(provider.key, existing[0]!.id)
      continue
    }

    const id = ulid()
    await db.insert(aiProviders).values({
      id,
      key: provider.key,
      displayName: provider.displayName,
      sdkProviderId: provider.sdkProviderId,
      enabled: true,
    })
    providerIdByKey.set(provider.key, id)
    console.log(`[AI Seed] Created provider "${provider.key}"`)
  }

  // ─── Models ────────────────────────────────────────────────────────────────
  let createdCount = 0
  for (const model of MODELS) {
    const providerId = providerIdByKey.get(model.providerKey)
    if (!providerId) {
      console.warn(`[AI Seed] Skipping model ${model.modelId}: provider "${model.providerKey}" not found`)
      continue
    }

    const existing = await db
      .select()
      .from(aiModels)
      .where(and(
        eq(aiModels.providerId, providerId),
        eq(aiModels.modelId, model.modelId),
      ))
      .limit(1)

    if (existing.length > 0)
      continue

    await db.insert(aiModels).values({
      id: ulid(),
      providerId,
      modelId: model.modelId,
      displayName: model.displayName,
      contextWindow: model.contextWindow,
      supportsTools: model.supportsTools,
      supportsStreaming: model.supportsStreaming,
      supportsVision: model.supportsVision,
      inputPricePerMtok: model.inputPricePerMtok ?? null,
      outputPricePerMtok: model.outputPricePerMtok ?? null,
      enabled: true,
      isDefault: model.isDefault ?? false,
    })
    createdCount += 1
    console.log(`[AI Seed] Created model "${model.providerKey}/${model.modelId}"${model.isDefault ? ' (default)' : ''}`)
  }

  if (createdCount === 0)
    console.log('[AI Seed] All providers and models already present')
}
