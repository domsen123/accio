/**
 * Zod v4 schemas + response serialisers for the audit-log API surface (T-3.8).
 *
 * The list query accepts repeatable `status` / `class` parameters, an
 * optional `toolName` substring, ISO date bounds, and pagination knobs. The
 * serializer flattens `AuditRowHydrated` into the JSON shape consumed by the
 * UI — no Date instances cross the wire (`toISOString` everywhere).
 *
 * Refs: REQ-ORCH-6 (audit log fields), DESIGN-API §Orchestrator (route),
 * ADR-012 (server returns stable error codes).
 */
import type { AuditRowHydrated } from './audit'
import { z } from 'zod'
import { AUDIT_LIST_DEFAULT_LIMIT, AUDIT_LIST_MAX_LIMIT } from './audit'

const TOOL_NAME_MAX = 200

// Repeatable query params: callers can send either `status=executed` once or
// `status=executed&status=failed`. `URLSearchParams` collapses single values
// to a string and arrays to a string[]; `z.preprocess` normalises both.
const repeatableEnum = <T extends [string, ...string[]]>(values: T) => z.preprocess(
  (v) => {
    if (v == null || v === '')
      return undefined
    if (Array.isArray(v))
      return v
    return [v]
  },
  z.array(z.enum(values)).optional(),
)

const isoDate = z.preprocess(
  (v) => {
    if (typeof v !== 'string' || v.trim() === '')
      return undefined
    return v
  },
  z.string().datetime({ offset: true }).optional(),
)

export const auditListQuerySchema = z.object({
  conversationId: z.string().trim().min(1).optional(),
  toolName: z.string().trim().min(1).max(TOOL_NAME_MAX).optional(),
  modelId: z.string().trim().min(1).optional(),
  status: repeatableEnum([
    'pending_confirmation',
    'confirmed',
    'cancelled',
    'executed',
    'failed',
  ] as const),
  class: repeatableEnum(['auto', 'confirm'] as const),
  since: isoDate,
  until: isoDate,
  limit: z.coerce.number().int().min(1).max(AUDIT_LIST_MAX_LIMIT).optional(),
  offset: z.coerce.number().int().min(0).optional(),
  sort: z.enum(['createdAt:desc', 'createdAt:asc']).optional(),
})

export type AuditListQuery = z.infer<typeof auditListQuerySchema>

export const AUDIT_LIST_LIMIT_DEFAULTS = {
  default: AUDIT_LIST_DEFAULT_LIMIT,
  max: AUDIT_LIST_MAX_LIMIT,
} as const

export interface SerialisedAuditRow {
  id: string
  createdAt: string
  toolName: string
  class: 'auto' | 'confirm'
  status: 'pending_confirmation' | 'confirmed' | 'cancelled' | 'executed' | 'failed'
  affectedCount: number | null
  parameters: unknown
  result: unknown
  error: string | null
  model: { id: string, displayName: string, modelId: string } | null
  userId: string | null
  conversationId: string
  conversationTitle: string | null
  messageId: string | null
  organisationId: string
  executedAt: string | null
  confirmedAt: string | null
  cancelledAt: string | null
}

export const serialiseAuditRow = (row: AuditRowHydrated): SerialisedAuditRow => ({
  id: row.id,
  createdAt: row.createdAt.toISOString(),
  toolName: row.toolName,
  class: row.class,
  status: row.status,
  affectedCount: row.affectedCount,
  parameters: row.parameters,
  result: row.result,
  error: row.error,
  model: row.model,
  userId: row.userId,
  conversationId: row.conversationId,
  conversationTitle: row.conversationTitle,
  messageId: row.messageId,
  organisationId: row.organisationId,
  executedAt: row.executedAt ? row.executedAt.toISOString() : null,
  confirmedAt: row.confirmedAt ? row.confirmedAt.toISOString() : null,
  cancelledAt: row.cancelledAt ? row.cancelledAt.toISOString() : null,
})
