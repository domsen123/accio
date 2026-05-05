/**
 * Typed `$fetch` wrappers for the projects connection API (T-4.8, T-4.6).
 *
 * Mirrors `app/features/orchestrator/api/conversations.ts`: a factory grabs
 * the SSR-aware `$api` so cookies forward during SSR. Workspace context is
 * injected via the `X-Organisation-Id` header / query fallback handled
 * server-side.
 */
import type {
  ConnectionConnectInput,
  ConnectionConnectResult,
  ConnectionRevokeResult,
  ConnectionStatus,
  ConnectionValidateResult,
} from '../types/projects.types'

export const useGhConnectionApi = () => {
  const { $api } = useNuxtApp()

  return {
    getStatus: (): Promise<ConnectionStatus> =>
      $api('/api/projects/connection'),

    connect: (input: ConnectionConnectInput): Promise<ConnectionConnectResult> =>
      $api('/api/projects/connection', { method: 'POST', body: input }),

    revoke: (purgeData: boolean): Promise<ConnectionRevokeResult> =>
      $api('/api/projects/connection', {
        method: 'DELETE',
        query: { purgeData: purgeData ? '1' : '0' },
      }),

    validate: (): Promise<ConnectionValidateResult> =>
      $api('/api/projects/connection/validate', { method: 'POST' }),
  }
}

export const ghConnectionKeys = {
  all: ['projects', 'connection'] as const,
  status: () => ['projects', 'connection', 'status'] as const,
}
