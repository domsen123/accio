/**
 * Typed `$fetch` wrappers for the orchestrator audit log API (T-3.8).
 *
 * Mirrors the AI feature convention: `useAuditApi()` factory grabs the
 * SSR-aware `$api` from `useNuxtApp()` so cookies forward correctly during
 * server-side rendering. Workspace context is injected by the
 * `X-Organisation-Id` header / query fallback handled server-side.
 */
import type {
  AuditDetailResponse,
  AuditListQuery,
  AuditListResponse,
} from '../types/audit.types'

const buildQuery = (params: AuditListQuery): Record<string, unknown> => {
  const q: Record<string, unknown> = {}
  if (params.conversationId)
    q.conversationId = params.conversationId
  if (params.toolName)
    q.toolName = params.toolName
  if (params.modelId)
    q.modelId = params.modelId
  if (params.status && params.status.length > 0)
    q.status = params.status
  if (params.class && params.class.length > 0)
    q.class = params.class
  if (params.since)
    q.since = params.since
  if (params.until)
    q.until = params.until
  if (typeof params.limit === 'number')
    q.limit = params.limit
  if (typeof params.offset === 'number')
    q.offset = params.offset
  if (params.sort)
    q.sort = params.sort
  return q
}

export const useAuditApi = () => {
  const { $api } = useNuxtApp()

  return {
    list: (params: AuditListQuery = {}): Promise<AuditListResponse> =>
      $api('/api/orchestrator/audit', { query: buildQuery(params) }),

    findById: (id: string): Promise<AuditDetailResponse> =>
      $api(String(`/api/orchestrator/audit/${id}`)),
  }
}

export const auditKeys = {
  all: ['orchestrator', 'audit'] as const,
  list: (params: AuditListQuery) => ['orchestrator', 'audit', 'list', params] as const,
  detail: (id: string) => ['orchestrator', 'audit', 'detail', id] as const,
}
