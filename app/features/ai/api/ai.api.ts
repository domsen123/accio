/**
 * Typed `$fetch` wrappers around the AI Configuration API surface (T-3.1e).
 *
 * Mirrors the convention used by the KB / Todo slices: a `useAiApi()` factory
 * grabs the SSR-aware `$api` from `useNuxtApp()` so cookies forward correctly
 * during server-side rendering. Workspace context is injected by the
 * `X-Organisation-Id` header / query fallback handled server-side.
 */
import type {
  AdminAiModelResponse,
  AdminAiProviderResponse,
  AdminListAiModelsResponse,
  AdminListAiProvidersResponse,
  AiSettingsResponse,
  CreateAiModelInput,
  ListAiCredentialsResponse,
  ListAiModelsResponse,
  ListAiProvidersResponse,
  SetAiCredentialsInput,
  SetAiCredentialsResponse,
  UpdateAiModelInput,
  UpdateAiProviderInput,
  UpdateAiSettingsInput,
} from '../types/ai.types'

export const useAiApi = () => {
  const { $api } = useNuxtApp()

  return {
    // ─── Workspace ─────────────────────────────────────────────────────────

    listProviders: (): Promise<ListAiProvidersResponse> =>
      $api('/api/ai/providers'),

    listModels: (): Promise<ListAiModelsResponse> =>
      $api('/api/ai/models'),

    listCredentials: (): Promise<ListAiCredentialsResponse> =>
      $api('/api/ai/credentials'),

    setCredentials: (
      providerId: string,
      data: SetAiCredentialsInput,
    ): Promise<SetAiCredentialsResponse> =>
      $api(String(`/api/ai/credentials/${providerId}`), {
        method: 'PUT',
        body: data,
      }),

    clearCredentials: (providerId: string): Promise<{ success: true }> =>
      $api(String(`/api/ai/credentials/${providerId}`), {
        method: 'DELETE',
      }),

    getSettings: (): Promise<AiSettingsResponse> =>
      $api('/api/ai/settings'),

    updateSettings: (data: UpdateAiSettingsInput): Promise<AiSettingsResponse> =>
      $api('/api/ai/settings', {
        method: 'PUT',
        body: data,
      }),

    // ─── Admin ─────────────────────────────────────────────────────────────

    adminListProviders: (): Promise<AdminListAiProvidersResponse> =>
      $api('/api/admin/ai/providers'),

    adminUpdateProvider: (
      id: string,
      data: UpdateAiProviderInput,
    ): Promise<AdminAiProviderResponse> =>
      $api(String(`/api/admin/ai/providers/${id}`), {
        method: 'PATCH',
        body: data,
      }),

    adminListModels: (): Promise<AdminListAiModelsResponse> =>
      $api('/api/admin/ai/models'),

    adminCreateModel: (data: CreateAiModelInput): Promise<AdminAiModelResponse> =>
      $api('/api/admin/ai/models', {
        method: 'POST',
        body: data,
      }),

    adminUpdateModel: (
      id: string,
      data: UpdateAiModelInput,
    ): Promise<AdminAiModelResponse> =>
      $api(String(`/api/admin/ai/models/${id}`), {
        method: 'PATCH',
        body: data,
      }),

    adminDeleteModel: (id: string): Promise<{ success: true }> =>
      $api(String(`/api/admin/ai/models/${id}`), {
        method: 'DELETE',
      }),
  }
}
