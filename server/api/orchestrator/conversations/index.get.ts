import { resolveWorkspace } from '~~/server/features/kb/workspace'
import { readOrchestratorQuery } from '~~/server/features/orchestrator/api-utils'
/**
 * GET /api/orchestrator/conversations — workspace-scoped list of conversations
 * (T-3.9, REQ-ORCH-1: "list past conversations and resume them").
 *
 * Query params:
 *   - `includeDeleted` (default false) — include soft-deleted rows.
 *   - `limit` (default 50, max 200), `offset` (default 0).
 *   - `sort` — one of `updatedAt:desc` (default), `updatedAt:asc`,
 *     `createdAt:desc`, `createdAt:asc`.
 *
 * Each row carries `lastMessageAt` for the resume-most-recent UX without a
 * second round-trip; full message lists go through the detail endpoint.
 *
 * Permission: `orchestrator:use`.
 */
import {
  CONVERSATION_LIST_DEFAULT_LIMIT,
  conversationListQuerySchema,
  serialiseConversationListItem,
} from '~~/server/features/orchestrator/conversation-schemas'
import { PERMISSIONS } from '~~/server/features/rbac/permissions'
import { requirePermission } from '~~/server/features/rbac/rbac.guard'
import { container } from '~~/server/utils/container'

export default defineEventHandler(async (event) => {
  const ws = await resolveWorkspace(event)

  await requirePermission(event, {
    permission: PERMISSIONS.ORCHESTRATOR_USE,
    scope: 'organisation',
    getScopeId: () => ws.organisationId,
  })

  const q = readOrchestratorQuery(event, conversationListQuerySchema)

  const { rows, total } = await container.conversationsService.list({
    organisationId: ws.organisationId,
    includeDeleted: q.includeDeleted,
    limit: q.limit,
    offset: q.offset,
    sort: q.sort,
  })

  return {
    rows: rows.map(serialiseConversationListItem),
    total,
    limit: q.limit ?? CONVERSATION_LIST_DEFAULT_LIMIT,
    offset: q.offset ?? 0,
  }
})
