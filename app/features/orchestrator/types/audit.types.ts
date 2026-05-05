/**
 * Client-side types for the orchestrator audit log surface (T-3.8). The
 * shapes mirror the server's `serialiseAuditRow` output — see
 * `server/features/orchestrator/audit-schemas.ts`.
 */

export type AuditActionStatus
  = | 'pending_confirmation'
    | 'confirmed'
    | 'cancelled'
    | 'executed'
    | 'failed'

export type AuditActionClass = 'auto' | 'confirm'

export interface AuditModelRef {
  id: string
  displayName: string
  modelId: string
}

export interface AuditRow {
  id: string
  createdAt: string
  toolName: string
  class: AuditActionClass
  status: AuditActionStatus
  affectedCount: number | null
  parameters: unknown
  result: unknown
  error: string | null
  model: AuditModelRef | null
  userId: string | null
  conversationId: string
  conversationTitle: string | null
  messageId: string | null
  organisationId: string
  executedAt: string | null
  confirmedAt: string | null
  cancelledAt: string | null
}

export interface AuditListResponse {
  rows: AuditRow[]
  total: number
  limit: number
  offset: number
}

export interface AuditDetailResponse {
  row: AuditRow
}

/** Query parameters accepted by `GET /api/orchestrator/audit`. */
export interface AuditListQuery {
  conversationId?: string
  toolName?: string
  modelId?: string
  status?: AuditActionStatus[]
  class?: AuditActionClass[]
  /** ISO 8601 with timezone offset. */
  since?: string
  /** ISO 8601 with timezone offset. */
  until?: string
  limit?: number
  offset?: number
  sort?: 'createdAt:desc' | 'createdAt:asc'
}
