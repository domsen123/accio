import { resolveWorkspace } from '~~/server/features/kb/workspace'
/**
 * GET /api/orchestrator/audit/[id] — single-row detail for the audit log
 * drawer (T-3.8). Workspace-scoped via `findById(actionId, organisationId)`;
 * cross-organisation lookups return 404 (not 403) to avoid existence leaks.
 *
 * Permission: `orchestrator:audit:view`.
 */
import { getRequiredParam, orchestratorThrow } from '~~/server/features/orchestrator/api-utils'
import { serialiseAuditRow } from '~~/server/features/orchestrator/audit-schemas'
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

  const id = getRequiredParam(event, 'id', 'orchestrator.audit.id_required')

  const row = await container.auditService.findById(id, ws.organisationId)
  if (!row)
    orchestratorThrow(404, 'orchestrator.audit.not_found', { id })

  return { row: serialiseAuditRow(row!) }
})
