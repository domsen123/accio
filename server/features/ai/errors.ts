// Domain errors for the AI provider client builder (T-3.1d).
//
// These are thrown by `aiProviderService` and caught by the API layer to map
// onto stable error codes (e.g. `AI_MODEL_NOT_FOUND`) for the i18n-aware UI.
//
// Each error carries the relevant identifiers so callers can render a useful
// message (e.g. "no credentials configured for Anthropic — open settings →
// AI to add a key").

/**
 * Thrown when `resolveModelClient` is called with a `modelId` that does not
 * exist in `ai_models`.
 */
export class AiModelNotFoundError extends Error {
  readonly modelId: string
  constructor(modelId: string) {
    super(`AI model "${modelId}" not found`)
    this.name = 'AiModelNotFoundError'
    this.modelId = modelId
  }
}

/**
 * Thrown when the `ai_models` row exists but `enabled = false`. Disabled
 * models stay in the table for audit-log FK integrity but cannot be used to
 * produce a fresh client.
 */
export class AiModelDisabledError extends Error {
  readonly modelId: string
  constructor(modelId: string) {
    super(`AI model "${modelId}" is disabled`)
    this.name = 'AiModelDisabledError'
    this.modelId = modelId
  }
}

/**
 * Thrown when the model's provider has been globally disabled
 * (`ai_providers.enabled = false`).
 */
export class AiProviderDisabledError extends Error {
  readonly providerKey: string
  constructor(providerKey: string) {
    super(`AI provider "${providerKey}" is disabled`)
    this.name = 'AiProviderDisabledError'
    this.providerKey = providerKey
  }
}

/**
 * Thrown when the provider key in `ai_providers.key` does not match any of
 * the SDK factories the builder knows how to construct (anthropic / openai /
 * google).
 */
export class AiProviderUnsupportedError extends Error {
  readonly providerKey: string
  constructor(providerKey: string) {
    super(`AI provider "${providerKey}" is not supported by the client builder`)
    this.name = 'AiProviderUnsupportedError'
    this.providerKey = providerKey
  }
}

/**
 * Thrown when no `ai_provider_credentials` row exists for the
 * (organisation, provider) pair. The user needs to add an API key in
 * `/app/settings/ai`.
 */
export class AiCredentialsMissingError extends Error {
  readonly organisationId: string
  readonly providerKey: string
  constructor(organisationId: string, providerKey: string) {
    super(`No AI credentials configured for provider "${providerKey}" in workspace "${organisationId}"`)
    this.name = 'AiCredentialsMissingError'
    this.organisationId = organisationId
    this.providerKey = providerKey
  }
}

/**
 * Thrown by `getDefaultModel` when neither the workspace setting nor the
 * platform-global `is_default = true` row resolves to an enabled model.
 */
export class AiNoDefaultModelError extends Error {
  readonly organisationId: string
  constructor(organisationId: string) {
    super(`No default AI model configured for workspace "${organisationId}" and no global default available`)
    this.name = 'AiNoDefaultModelError'
    this.organisationId = organisationId
  }
}
