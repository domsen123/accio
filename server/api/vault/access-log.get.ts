/**
 * GET /api/vault/access-log — paginated workspace audit log
 * (T-V-29, REQ-VAULT-18, REQ-VAULT-19).
 *
 * Filters: `eventType` (one of the enum values), `since` (ISO timestamp).
 * Pagination via `limit` (default 50, max 200) + `offset`. Joins
 * `vaultEntries.title` so the UI can render entry references without a
 * second round trip.
 */
import { and, desc, eq, gte, sql } from 'drizzle-orm'
import { z } from 'zod'
import { vaultAccessLog, vaultEntries } from '~~/server/database/schema'
import { resolveWorkspace } from '~~/server/features/kb/workspace'
import { PERMISSIONS } from '~~/server/features/rbac/permissions'
import { requirePermission } from '~~/server/features/rbac/rbac.guard'
import { requireVaultUnlocked } from '~~/server/features/vault/api-utils'
import { getDatabase } from '~~/server/infrastructure/database/client'

const eventTypes = [
  'unlock',
  'lock',
  'auto_lock',
  'ui_reveal',
  'orchestrator_reveal',
  'orchestrator_search',
  'entry_create',
  'entry_update',
  'entry_delete',
] as const

const querySchema = z.object({
  eventType: z.enum(eventTypes).optional(),
  since: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  offset: z.coerce.number().int().nonnegative().optional(),
})

export default defineEventHandler(async (event) => {
  const ws = await resolveWorkspace(event)
  await requirePermission(event, {
    permission: PERMISSIONS.VAULT_READ,
    scope: 'organisation',
    getScopeId: () => ws.organisationId,
  })

  requireVaultUnlocked(event)

  const q = await getValidatedQuery(event, query => querySchema.parse(query))
  const limit = q.limit ?? 50
  const offset = q.offset ?? 0

  const db = getDatabase('app')
  const conditions = [eq(vaultAccessLog.organisationId, ws.organisationId)]
  if (q.eventType)
    conditions.push(eq(vaultAccessLog.eventType, q.eventType))
  if (q.since)
    conditions.push(gte(vaultAccessLog.createdAt, new Date(q.since)))

  const rows = await db
    .select({
      id: vaultAccessLog.id,
      organisationId: vaultAccessLog.organisationId,
      userId: vaultAccessLog.userId,
      entryId: vaultAccessLog.entryId,
      eventType: vaultAccessLog.eventType,
      fieldName: vaultAccessLog.fieldName,
      reason: vaultAccessLog.reason,
      conversationId: vaultAccessLog.conversationId,
      createdAt: vaultAccessLog.createdAt,
      entryTitle: vaultEntries.title,
    })
    .from(vaultAccessLog)
    .leftJoin(vaultEntries, eq(vaultAccessLog.entryId, vaultEntries.id))
    .where(and(...conditions))
    .orderBy(desc(vaultAccessLog.createdAt))
    .limit(limit)
    .offset(offset)

  const totals = await db
    .select({ value: sql<number>`count(*)::int` })
    .from(vaultAccessLog)
    .where(and(...conditions))
  const total = totals[0]?.value ?? 0

  return {
    data: rows,
    total,
    limit,
    offset,
  }
})
