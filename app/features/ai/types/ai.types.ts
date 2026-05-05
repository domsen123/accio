/**
 * Client-side types mirroring the AI Configuration server response shapes
 * (T-3.1e). Kept narrow on purpose — the chat / streaming surface lands in
 * T-3.2+ and will get its own types module.
 */

export interface AiProviderStatus {
  providerId: string
  providerKey: string
  providerDisplayName: string
  providerEnabled: boolean
  hasCredentials: boolean
  baseUrl: string | null
  /** ISO 8601 timestamp; null when no credential row exists. */
  updatedAt: string | null
}

export interface AiProviderRow {
  id: string
  key: string
  displayName: string
  sdkProviderId: string
  enabled: boolean
  createdAt: string
  updatedAt: string
}

export interface AiModelRow {
  id: string
  providerId: string
  modelId: string
  displayName: string
  contextWindow: number
  supportsTools: boolean
  supportsStreaming: boolean
  supportsVision: boolean
  inputPricePerMtok: string | null
  outputPricePerMtok: string | null
  enabled: boolean
  isDefault: boolean
  createdAt: string
  updatedAt: string
}

export interface AiModelWithProvider extends AiModelRow {
  providerKey: string
  providerDisplayName: string
  providerEnabled: boolean
}

export interface AiWorkspaceSettings {
  organisationId: string
  defaultModelId: string | null
  aiDisplayName: string
  historyLimit: number
  systemPrompt: string | null
  createdAt: string
  updatedAt: string
}

// ─── Request/response shapes ────────────────────────────────────────────────

export interface ListAiProvidersResponse {
  providers: AiProviderStatus[]
}

export interface ListAiModelsResponse {
  models: AiModelWithProvider[]
}

export interface ListAiCredentialsResponse {
  credentials: AiProviderStatus[]
}

export interface AiSettingsResponse {
  settings: AiWorkspaceSettings
}

export interface SetAiCredentialsInput {
  apiKey: string
  baseUrl?: string | null
}

export interface SetAiCredentialsResponse {
  credential: { providerId: string, hasCredentials: true }
}

export interface UpdateAiSettingsInput {
  defaultModelId?: string | null
  aiDisplayName?: string
  historyLimit?: number
  systemPrompt?: string | null
}

// Admin-side

export interface AdminListAiProvidersResponse {
  providers: AiProviderRow[]
}

export interface AdminListAiModelsResponse {
  models: AiModelWithProvider[]
}

export interface CreateAiModelInput {
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
}

export interface UpdateAiModelInput {
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
}

export interface AdminAiModelResponse {
  model: AiModelWithProvider | AiModelRow
}

export interface UpdateAiProviderInput {
  enabled: boolean
}

export interface AdminAiProviderResponse {
  provider: AiProviderRow
}
