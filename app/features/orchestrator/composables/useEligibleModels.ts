/**
 * Eligible-models composable for the orchestrator chat picker (T-3.13).
 *
 * Combines `useAiProviders` + `useAiCredentials` + `useAiModels` and filters
 * to the set of models a conversation can actually route through:
 *
 *   - The provider has credentials configured in this workspace (REQ-AI-4).
 *   - The provider is enabled (`hasCredentials` already implies enabled in
 *     practice but we double-check via `providerEnabled`).
 *   - The model itself is enabled.
 *   - The model supports tools AND streaming (REQ-AI-4 hard requirement —
 *     orchestrator chat needs both).
 *
 * Filter logic lives in `./eligibleModelsFilter.ts` as a pure helper so it
 * can be unit-tested without mounting Pinia Colada or resolving the Nuxt
 * `~/...` alias.
 */
import { useAiCredentials } from '~/features/ai/composables/useAiCredentials'
import { useAiModels } from '~/features/ai/composables/useAiModels'
import { useAiProviders } from '~/features/ai/composables/useAiProviders'
import { filterEligibleModels } from './eligibleModelsFilter'

export const useEligibleModels = () => {
  const { providers, isLoading: providersLoading } = useAiProviders()
  const { credentials, isLoading: credentialsLoading } = useAiCredentials()
  const { models, isLoading: modelsLoading } = useAiModels()

  const eligibleModels = computed(() =>
    filterEligibleModels(models.value, providers.value, credentials.value),
  )

  const isLoading = computed(() =>
    providersLoading.value || credentialsLoading.value || modelsLoading.value,
  )

  return {
    eligibleModels,
    isLoading,
    providers,
    credentials,
    models,
  }
}
