import { resolveWorkspace } from '~~/server/features/kb/workspace'
/**
 * GET /api/orchestrator/audit — workspace-scoped, paginated, filterable audit
 * log of `orchestrator_actions` rows (T-3.8, REQ-ORCH-6, DESIGN-API).
 *
 * Permission: `orchestrator:audit:view` on the active workspace organisation.
 * Filters: `conversationId`, `toolName` (substring), `modelId`, `status` (multi),
 * `class` (multi), `since` / `until` (ISO 8601 with timezone offset).
 * Pagination: `limit` (default 50, max 200) + `offset`. Sort: `createdAt:desc`
 * (default) or `createdAt:asc`.
 */
import { readOrchestratorQuery } from '~~/server/features/orchestrator/api-utils'
import { auditListQuerySchema, serialiseAuditRow } from '~~/server/features/orchestrator/audit-schemas'
import { PERMISSIONS } from '~~/server/features/rbac/permissions'
import { requirePermission } from '~~/server/features/rbac/rbac.guard'
import { container } from '~~/server/utils/container'

export default defineEventHandler(async (event) => {
  const ws = await resolveWorkspace(event)

  await requirePermission(event, {
    permission: PERMISSIONS.ORCHESTRATOR_AUDIT_VIEW,
    scope: 'organisation',
    getScopeId: () => ws.organisationId,
  })

  const q = readOrchestratorQuery(event, auditListQuerySchema)

  const { rows, total } = await container.auditService.list({
    organisationId: ws.organisationId,
    filter: {
      conversationId: q.conversationId,
      toolName: q.toolName,
      modelId: q.modelId,
      status: q.status,
      class: q.class,
      since: q.since ? new Date(q.since) : undefined,
      until: q.until ? new Date(q.until) : undefined,
    },
    pagination: {
      limit: q.limit,
      offset: q.offset,
    },
    sort: q.sort,
  })

  return {
    rows: rows.map(serialiseAuditRow),
    total,
    limit: q.limit ?? 50,
    offset: q.offset ?? 0,
  }
})
