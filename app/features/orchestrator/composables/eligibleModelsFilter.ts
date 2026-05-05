/**
 * Pure helper for the orchestrator eligible-models picker (T-3.13).
 *
 * Extracted from `useEligibleModels.ts` so it can be unit-tested without
 * importing the Pinia Colada / Nuxt auto-imported composable graph (the
 * vitest "unit" project runs in plain Node and doesn't resolve the `~/...`
 * alias for app code).
 *
 * Filter rules (REQ-AI-4):
 *   - Provider must be enabled and have credentials in this workspace.
 *   - Model must be enabled.
 *   - Model must support tools AND streaming.
 *   - Credential rows from `/api/ai/credentials` override provider rows when
 *     both reference the same provider id (more authoritative status).
 *   - Models pointing at unknown provider ids are excluded.
 */
import type {
  AiModelWithProvider,
  AiProviderStatus,
} from '~/features/ai/types/ai.types'

export const filterEligibleModels = (
  models: ReadonlyArray<AiModelWithProvider>,
  providers: ReadonlyArray<AiProviderStatus>,
  credentials: ReadonlyArray<AiProviderStatus> = [],
): AiModelWithProvider[] => {
  const credByProvider = new Map<string, AiProviderStatus>()
  for (const c of credentials)
    credByProvider.set(c.providerId, c)
  const provByProvider = new Map<string, AiProviderStatus>()
  for (const p of providers)
    provByProvider.set(p.providerId, p)

  return models.filter((m) => {
    if (!m.enabled)
      return false
    if (!m.supportsTools || !m.supportsStreaming)
      return false
    const cred = credByProvider.get(m.providerId)
    const prov = provByProvider.get(m.providerId)
    const status = cred ?? prov
    if (!status)
      return false
    if (!status.providerEnabled)
      return false
    if (!status.hasCredentials)
      return false
    return true
  })
}
