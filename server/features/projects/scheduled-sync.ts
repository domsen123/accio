import type { DatabaseClient } from '../../infrastructure/database/client'
import type { GhSyncService, SyncAllTrackedResult } from './sync.service'
import { and, eq, isNull } from 'drizzle-orm'
import { ghRepos } from '../../database/schema'

// ─── Scheduled GitHub sync helper (T-4.5) ──────────────────────────────────
//
// Refs: REQ-PROJ-3 (sync every 15 min, configurable). Discovers every
// organisation that owns at least one tracked, non-soft-deleted gh_repos row
// and calls ghSyncService.syncAllTracked per org. T-4.4's syncAllTracked is
// already continue-on-error per-repo; we additionally trap any unexpected
// throw at the org level so a single broken workspace can't tank the tick.
//
// This file is the testable seam — the Nitro task in `server/tasks/projects-
// sync.ts` is a thin wrapper that resolves `db` + `ghSyncService` from the
// container and forwards to `runScheduledSync`.

export interface ScheduledSyncLogger {
  info: (msg: string, data?: Record<string, unknown>) => void
  error: (msg: string, data?: Record<string, unknown>) => void
}

export interface RunScheduledSyncDeps {
  db: DatabaseClient
  ghSyncService: Pick<GhSyncService, 'syncAllTracked'>
  logger?: ScheduledSyncLogger
}

export interface ScheduledSyncOrgResultOk {
  organisationId: string
  ok: true
  reposSynced: number
  reposFailed: number
}

export interface ScheduledSyncOrgResultErr {
  organisationId: string
  ok: false
  error: string
}

export type ScheduledSyncOrgResult = ScheduledSyncOrgResultOk | ScheduledSyncOrgResultErr

export interface ScheduledSyncResult {
  organisations: ScheduledSyncOrgResult[]
}

const errorMessage = (err: unknown): string => {
  if (err instanceof Error)
    return err.message
  if (typeof err === 'string')
    return err
  return String(err)
}

const summariseRepoResults = (result: SyncAllTrackedResult) => {
  let ok = 0
  let failed = 0
  for (const r of result.repoResults) {
    if (r.ok)
      ok += 1
    else
      failed += 1
  }
  return { ok, failed }
}

export const runScheduledSync = async (deps: RunScheduledSyncDeps): Promise<ScheduledSyncResult> => {
  const { db, ghSyncService, logger } = deps

  const rows = await db
    .selectDistinct({ organisationId: ghRepos.organisationId })
    .from(ghRepos)
    .where(and(eq(ghRepos.tracked, true), isNull(ghRepos.deletedAt)))

  const organisations: ScheduledSyncOrgResult[] = []
  for (const row of rows) {
    try {
      const result = await ghSyncService.syncAllTracked({ organisationId: row.organisationId })
      const { ok, failed } = summariseRepoResults(result)
      logger?.info('[gh:sync-all] org synced', {
        organisationId: row.organisationId,
        reposSynced: ok,
        reposFailed: failed,
      })
      organisations.push({ organisationId: row.organisationId, ok: true, reposSynced: ok, reposFailed: failed })
    }
    catch (err) {
      const msg = errorMessage(err)
      logger?.error('[gh:sync-all] org failed', { organisationId: row.organisationId, error: msg })
      organisations.push({ organisationId: row.organisationId, ok: false, error: msg })
    }
  }

  return { organisations }
}
