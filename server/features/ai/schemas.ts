/**
 * Zod schemas (v4) for the AI Configuration API surface (T-3.1e).
 *
 * Refs: DESIGN-API §AI Configuration, REQ-AI-2 (per-workspace credentials),
 * REQ-AI-3 (DB-driven model registry), REQ-AI-4 (model selection).
 *
 * The workspace-side schemas cover credential save/clear and the orchestrator
 * workspace settings (default model, AI display name, history limit). The
 * admin-side schemas cover model registry CRUD; provider creation is not
 * exposed because providers are tied to bundled SDK adapters and adding a new
 * provider requires code changes (see ADR-013). Provider toggles `is_enabled`
 * only.
 */
import { z } from 'zod'

const API_KEY_MAX = 4096
const BASE_URL_MAX = 2048
const DISPLAY_NAME_MAX = 200
const SYSTEM_PROMPT_MAX = 200_000
const MODEL_CODE_MAX = 200
const NOTES_MAX = 2000

// ─── Workspace credentials ──────────────────────────────────────────────────

/**
 * Body for `PUT /api/ai/credentials/[providerId]`. The plaintext is encrypted
 * with `encryptForOrg` before it touches a row; nothing else in the system
 * ever sees `apiKey` again.
 */
export const setCredentialSchema = z.object({
  apiKey: z.string().trim().min(1).max(API_KEY_MAX),
  baseUrl: z.string().trim().min(1).max(BASE_URL_MAX).nullable().optional(),
})

// ─── Workspace settings ─────────────────────────────────────────────────────

export const updateWorkspaceSettingsSchema = z.object({
  defaultModelId: z.string().trim().min(1).nullable().optional(),
  aiDisplayName: z.string().trim().min(1).max(DISPLAY_NAME_MAX).optional(),
  historyLimit: z.coerce.number().int().min(1).max(200).optional(),
  systemPrompt: z.string().max(SYSTEM_PROMPT_MAX).nullable().optional(),
})

// ─── Workspace list-flag query ──────────────────────────────────────────────

const truthy = new Set(['1', 'true', 'yes', 'on'])
const falsy = new Set(['0', 'false', 'no', 'off'])

const booleanQuery = z.preprocess((v) => {
  if (typeof v !== 'string')
    return v
  const lc = v.toLowerCase()
  if (truthy.has(lc))
    return true
  if (falsy.has(lc))
    return false
  return v
}, z.boolean().optional())

export const listProvidersQuerySchema = z.object({
  includeDisabled: booleanQuery,
})

export const listModelsQuerySchema = z.object({
  providerId: z.string().trim().min(1).optional(),
  includeDisabled: booleanQuery,
})

// ─── Admin model registry ───────────────────────────────────────────────────

export const createModelSchema = z.object({
  providerId: z.string().trim().min(1),
  modelId: z.string().trim().min(1).max(MODEL_CODE_MAX),
  displayName: z.string().trim().min(1).max(DISPLAY_NAME_MAX),
  contextWindow: z.coerce.number().int().min(1).max(10_000_000),
  supportsTools: z.boolean().optional(),
  supportsStreaming: z.boolean().optional(),
  supportsVision: z.boolean().optional(),
  inputPricePerMtok: z.string().trim().min(1).max(32).nullable().optional(),
  outputPricePerMtok: z.string().trim().min(1).max(32).nullable().optional(),
  enabled: z.boolean().optional(),
  isDefault: z.boolean().optional(),
  notes: z.string().trim().max(NOTES_MAX).optional(),
})

export const updateModelSchema = z.object({
  modelId: z.string().trim().min(1).max(MODEL_CODE_MAX).optional(),
  displayName: z.string().trim().min(1).max(DISPLAY_NAME_MAX).optional(),
  contextWindow: z.coerce.number().int().min(1).max(10_000_000).optional(),
  supportsTools: z.boolean().optional(),
  supportsStreaming: z.boolean().optional(),
  supportsVision: z.boolean().optional(),
  inputPricePerMtok: z.string().trim().min(1).max(32).nullable().optional(),
  outputPricePerMtok: z.string().trim().min(1).max(32).nullable().optional(),
  enabled: z.boolean().optional(),
  isDefault: z.boolean().optional(),
})

// ─── Admin provider toggles ─────────────────────────────────────────────────

export const updateProviderSchema = z.object({
  enabled: z.boolean(),
})
