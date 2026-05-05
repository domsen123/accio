/**
 * Unit tests for the orchestrator chat-page eligible-models filter (T-3.13).
 *
 * `filterEligibleModels` is a pure helper extracted from
 * `app/features/orchestrator/composables/useEligibleModels.ts` so we can
 * exercise its filter logic without standing up the Pinia Colada queries
 * it composes. The composable itself is a trivial wrapper that delegates to
 * this helper; if the contract here holds, the picker shows the right list.
 *
 * Filter rules under test (REQ-AI-4):
 *   - Provider must be enabled and have credentials.
 *   - Model must be enabled.
 *   - Model must declare `supports_tools=true` AND `supports_streaming=true`.
 *   - Credential rows from `/api/ai/credentials` override provider rows when
 *     both reference the same provider id (more authoritative status).
 *   - Models pointing at unknown provider ids are excluded.
 */
import type {
  AiModelWithProvider,
  AiProviderStatus,
} from '../app/features/ai/types/ai.types'
import { describe, expect, it } from 'vitest'

import { filterEligibleModels } from '../app/features/orchestrator/composables/eligibleModelsFilter'

const makeProvider = (overrides: Partial<AiProviderStatus> = {}): AiProviderStatus => ({
  providerId: 'p1',
  providerKey: 'p1-key',
  providerDisplayName: 'Provider 1',
  providerEnabled: true,
  hasCredentials: true,
  baseUrl: null,
  updatedAt: null,
  ...overrides,
})

const makeModel = (overrides: Partial<AiModelWithProvider> = {}): AiModelWithProvider => ({
  id: 'm1',
  providerId: 'p1',
  modelId: 'gpt-1',
  displayName: 'GPT-1',
  contextWindow: 128_000,
  supportsTools: true,
  supportsStreaming: true,
  supportsVision: false,
  inputPricePerMtok: null,
  outputPricePerMtok: null,
  enabled: true,
  isDefault: false,
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
  providerKey: 'p1-key',
  providerDisplayName: 'Provider 1',
  providerEnabled: true,
  ...overrides,
})

describe('filterEligibleModels', () => {
  it('keeps a model whose provider has credentials and which supports tools+streaming', () => {
    const model = makeModel()
    const provider = makeProvider()

    expect(filterEligibleModels([model], [provider])).toEqual([model])
  })

  it('drops a model whose provider has no credentials', () => {
    const model = makeModel()
    const provider = makeProvider({ hasCredentials: false })

    expect(filterEligibleModels([model], [provider])).toEqual([])
  })

  it('drops a model whose provider is disabled', () => {
    const model = makeModel()
    const provider = makeProvider({ providerEnabled: false })

    expect(filterEligibleModels([model], [provider])).toEqual([])
  })

  it('drops a model that lacks tool support', () => {
    const model = makeModel({ supportsTools: false })
    const provider = makeProvider()

    expect(filterEligibleModels([model], [provider])).toEqual([])
  })

  it('drops a model that lacks streaming support', () => {
    const model = makeModel({ supportsStreaming: false })
    const provider = makeProvider()

    expect(filterEligibleModels([model], [provider])).toEqual([])
  })

  it('drops a disabled model even when its provider is configured', () => {
    const model = makeModel({ enabled: false })
    const provider = makeProvider()

    expect(filterEligibleModels([model], [provider])).toEqual([])
  })

  it('drops a model whose provider is missing from both inputs', () => {
    const model = makeModel({ providerId: 'pX' })
    const provider = makeProvider({ providerId: 'pOther' })

    expect(filterEligibleModels([model], [provider])).toEqual([])
  })

  it('uses the credentials row when both providers and credentials disagree', () => {
    // Provider row says no creds, credentials row says yes — credentials wins.
    const model = makeModel()
    const provider = makeProvider({ hasCredentials: false })
    const credential = makeProvider({ hasCredentials: true })

    expect(filterEligibleModels([model], [provider], [credential])).toEqual([model])
  })

  it('uses the credentials row to revoke a provider that says it has creds', () => {
    // Inverse: provider list says creds, credentials list says cleared — drop.
    const model = makeModel()
    const provider = makeProvider({ hasCredentials: true })
    const credential = makeProvider({ hasCredentials: false })

    expect(filterEligibleModels([model], [provider], [credential])).toEqual([])
  })

  it('filters a mixed batch correctly', () => {
    const eligible = makeModel({ id: 'm-ok', providerId: 'p1' })
    const noTools = makeModel({ id: 'm-no-tools', providerId: 'p1', supportsTools: false })
    const noStream = makeModel({ id: 'm-no-stream', providerId: 'p1', supportsStreaming: false })
    const disabled = makeModel({ id: 'm-disabled', providerId: 'p1', enabled: false })
    const orphan = makeModel({ id: 'm-orphan', providerId: 'p-missing' })
    const provider = makeProvider({ providerId: 'p1' })

    const result = filterEligibleModels(
      [eligible, noTools, noStream, disabled, orphan],
      [provider],
    )

    expect(result.map(m => m.id)).toEqual(['m-ok'])
  })
})
