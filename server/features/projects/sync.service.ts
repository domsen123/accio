import type { GhRepo } from '../../database/schema'
import type { DatabaseClient } from '../../infrastructure/database/client'
import type { GhConnectionsService } from './connections.service'
import type { GhClientService } from './github-client'
import type { CommitSnapshot, IssueSnapshot, PullSnapshot, RepoSnapshot } from './types'
import { and, eq, isNull, sql } from 'drizzle-orm'
import { ulid } from 'ulid'
import {
  ghCommits,
  ghConnections,
  ghIssues,
  ghPulls,
  ghRepos,
} from '../../database/schema'
import {
  GhClientNotConnectedError,
  GhRateLimitedError,
  GhRepoNotFoundError,
  GhResourceNotFoundError,
  GhSyncFailedError,
  GhTokenInsufficientScopeError,
  GhTokenInvalidError,
  GhValidationFailedError,
} from './errors'

// ─── GitHub sync service (T-4.4) ────────────────────────────────────────────
//
// Refs: REQ-PROJ-2 (select repos to track), REQ-PROJ-3 (periodic sync of repo
// metadata + open issues + open PRs + last 50 commits, plus manual "Sync
// now"), DESIGN-DATA §Projects.
//
// Responsibilities:
//   1. Hydrate the repo-picker UI (T-4.8): join the live "accessible repos"
//      feed from the connected PAT against the local `gh_repos` cache so the
//      UI can render "already cached / tracked / last synced" badges per row.
//   2. Toggle the per-workspace `tracked` flag, inserting a stub row on first
//      track if the repo isn't cached yet. `setRepoTracked` does NOT trigger a
//      full sync — the UI calls `syncRepo` separately (REQ-PROJ-3 manual
//      button) so the toggle action stays cheap.
//   3. Run a single-repo full sync inside one transaction: refresh repo
//      metadata, upsert open issues + open PRs + the last 50 commits, then
//      bump `last_synced_at`.
//   4. Iterate every tracked repo for the workspace from the cron (T-4.5),
//      continuing on per-repo failure so a single revoked-access repo doesn't
//      tank the whole tick.
//   5. Provide a hard purge that drops a repo + its cached children
//      (cascade on the FK).
//
// **Closed-issue / closed-PR retention** — REQ-PROJ-3 specifies "open" for
// both feeds. We deliberately do NOT delete rows that have transitioned to
// closed/merged since the previous sync: the next sync will simply not return
// them in the open feed, and their cached state remains accurate. If a closed
// issue is re-opened upstream, it reappears in the open feed and the upsert
// flips its state back. Tightening this (a per-sync sweep that closes
// "missing-from-feed" rows) would need a separate "all" fetch — out of scope
// for v1.
//
// **Purge semantics** — `purgeRepo` soft-deletes the repo row (sets
// `deleted_at`, leaves the row visible to historical queries) AND
// hard-deletes its child issues/pulls/commits. Rationale: the cached children
// are large + only useful when the repo is actively tracked; the soft-deleted
// repo row preserves audit/backref context (e.g. an orchestrator action that
// referenced this repo can still resolve the row) without paying the cache
// cost. The FK on the children is `ON DELETE CASCADE` so a future hard-delete
// of the repo row would chain through; we avoid that here.

// ─── Public types ───────────────────────────────────────────────────────────

/**
 * Row returned by `listAccessibleRepos`. The first eight fields mirror
 * `RepoSnapshot` (the live feed); the last three are the local cache state
 * — `isCached: false` means the workspace has never tracked this repo.
 */
export interface AccessibleRepo {
  ghId: number
  owner: string
  name: string
  fullName: string
  description: string | null
  private: boolean
  htmlUrl: string
  defaultBranch: string | null
  ghCreatedAt: Date | null
  ghUpdatedAt: Date | null
  isCached: boolean
  isTracked: boolean
  lastSyncedAt: Date | null
}

export interface ListAccessibleReposArgs {
  organisationId: string
}

export interface ListAccessibleReposResult {
  repos: AccessibleRepo[]
}

export interface SetRepoTrackedArgs {
  organisationId: string
  owner: string
  name: string
  tracked: boolean
}

export interface SetRepoTrackedResult {
  repo: GhRepo
}

export interface SyncCounts {
  issues: number
  pulls: number
  commits: number
}

export interface SyncRepoArgs {
  organisationId: string
  /** Resolve by ULID — fast path used by the manual "Sync now" button. */
  repoId?: string
  /** Or resolve by `(owner, name)` — used by the periodic job + tests. */
  owner?: string
  name?: string
}

export interface SyncRepoResult {
  repo: GhRepo
  counts: SyncCounts
}

export interface SyncAllTrackedArgs {
  organisationId: string
}

export interface SyncAllTrackedRepoOk {
  repoId: string
  ok: true
  counts: SyncCounts
}

export interface SyncAllTrackedRepoErr {
  repoId: string
  ok: false
  error: string
}

export type SyncAllTrackedRepoResult = SyncAllTrackedRepoOk | SyncAllTrackedRepoErr

export interface SyncAllTrackedResult {
  repoResults: SyncAllTrackedRepoResult[]
}

export interface PurgeRepoArgs {
  organisationId: string
  repoId: string
}

export interface GhSyncServiceDeps {
  db: DatabaseClient
  ghClientService: Pick<
    GhClientService,
    'listAccessibleRepos' | 'getRepo' | 'listIssues' | 'listPulls' | 'listCommits'
  >
  ghConnectionsService: Pick<GhConnectionsService, 'getConnectionContext'>
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Errors that should propagate verbatim from `syncRepo` rather than being
 * wrapped in `GhSyncFailedError`. These are auth/connection failures that the
 * API layer maps to distinct HTTP codes (401/403/429/404/409); wrapping them
 * would erase that signal.
 */
const isPassThroughSyncError = (err: unknown): boolean =>
  err instanceof GhClientNotConnectedError
  || err instanceof GhTokenInvalidError
  || err instanceof GhTokenInsufficientScopeError
  || err instanceof GhRateLimitedError
  || err instanceof GhResourceNotFoundError
  || err instanceof GhValidationFailedError
  || err instanceof GhRepoNotFoundError

const errorMessage = (err: unknown): string => {
  if (err instanceof Error)
    return err.message
  if (typeof err === 'string')
    return err
  return String(err)
}

// ─── Service ────────────────────────────────────────────────────────────────

export const createGhSyncService = (deps: GhSyncServiceDeps) => {
  const { db, ghClientService } = deps

  /**
   * Look up the workspace's current `gh_connections.id`. Returned id is used
   * as `gh_repos.connection_id` on insert; if no connection exists the caller
   * has bigger problems (the upstream client wrapper would already have
   * thrown `GhClientNotConnectedError`), so we tolerate `null`.
   */
  const findConnectionId = async (organisationId: string): Promise<string | null> => {
    const rows = await db
      .select({ id: ghConnections.id })
      .from(ghConnections)
      .where(eq(ghConnections.organisationId, organisationId))
      .limit(1)
    return rows[0]?.id ?? null
  }

  const findRepoByOwnerName = async (
    organisationId: string,
    owner: string,
    name: string,
  ): Promise<GhRepo | null> => {
    const rows = await db
      .select()
      .from(ghRepos)
      .where(and(
        eq(ghRepos.organisationId, organisationId),
        eq(ghRepos.owner, owner),
        eq(ghRepos.name, name),
      ))
      .limit(1)
    return rows[0] ?? null
  }

  const findRepoById = async (organisationId: string, repoId: string): Promise<GhRepo | null> => {
    const rows = await db
      .select()
      .from(ghRepos)
      .where(and(eq(ghRepos.id, repoId), eq(ghRepos.organisationId, organisationId)))
      .limit(1)
    return rows[0] ?? null
  }

  /**
   * Insert-or-update a `gh_repos` row from a `RepoSnapshot`. Returns the row
   * post-write. The unique constraint is `(organisation_id, gh_id)`; on
   * conflict we update the descriptive fields but preserve `id`, `created_at`,
   * `organisation_id`, `connection_id`, and `tracked` — the latter is a
   * user-managed flag. `last_synced_at` is updated separately by the caller
   * once child upserts succeed.
   */
  const upsertRepoFromSnapshot = async (
    tx: DatabaseClient,
    organisationId: string,
    connectionId: string | null,
    snapshot: RepoSnapshot,
    options: { setTracked?: boolean } = {},
  ): Promise<GhRepo> => {
    const now = new Date()
    const id = ulid()
    const insertValues: typeof ghRepos.$inferInsert = {
      id,
      organisationId,
      connectionId,
      ghId: snapshot.ghId,
      owner: snapshot.owner,
      name: snapshot.name,
      fullName: snapshot.fullName,
      defaultBranch: snapshot.defaultBranch,
      private: snapshot.private,
      description: snapshot.description,
      tracked: options.setTracked ?? false,
      createdAt: now,
      updatedAt: now,
    }
    const updateSet: Record<string, unknown> = {
      owner: snapshot.owner,
      name: snapshot.name,
      fullName: snapshot.fullName,
      defaultBranch: snapshot.defaultBranch,
      private: snapshot.private,
      description: snapshot.description,
      updatedAt: now,
      // `deleted_at` is cleared on a fresh upsert so a purged-then-re-tracked
      // repo comes back to life. `tracked` is intentionally NOT touched here.
      deletedAt: null,
    }
    const [row] = await tx
      .insert(ghRepos)
      .values(insertValues)
      .onConflictDoUpdate({
        target: [ghRepos.organisationId, ghRepos.ghId],
        set: updateSet,
      })
      .returning()
    if (!row) {
      // Drizzle should always return a row for an INSERT...ON CONFLICT;
      // throw defensively so the transaction rolls back on the caller side.
      throw new GhSyncFailedError(organisationId, null, 'upsert returned no row for gh_repos')
    }
    return row
  }

  // ─── listAccessibleRepos ─────────────────────────────────────────────────

  const listAccessibleRepos = async (
    args: ListAccessibleReposArgs,
  ): Promise<ListAccessibleReposResult> => {
    const remote = await ghClientService.listAccessibleRepos(args.organisationId)

    // Pull every cache row for the workspace in one round trip; index the
    // entries by `gh_id` (stable across renames) and join in-memory. The
    // accessible-repos feed is bounded by `MAX_AUTO_PAGES * DEFAULT_PER_PAGE`
    // so the join cost is negligible.
    const cacheRows = await db
      .select({
        ghId: ghRepos.ghId,
        tracked: ghRepos.tracked,
        lastSyncedAt: ghRepos.lastSyncedAt,
        deletedAt: ghRepos.deletedAt,
      })
      .from(ghRepos)
      .where(eq(ghRepos.organisationId, args.organisationId))

    // Soft-deleted rows are treated as absent: the picker should let the user
    // re-track them without showing the stale "isCached" / "isTracked" state.
    const cacheByGhId = new Map<number, { tracked: boolean, lastSyncedAt: Date | null }>()
    for (const row of cacheRows) {
      if (row.deletedAt !== null)
        continue
      cacheByGhId.set(row.ghId, { tracked: row.tracked, lastSyncedAt: row.lastSyncedAt })
    }

    const repos: AccessibleRepo[] = remote.map((snapshot) => {
      const cached = cacheByGhId.get(snapshot.ghId)
      return {
        ghId: snapshot.ghId,
        owner: snapshot.owner,
        name: snapshot.name,
        fullName: snapshot.fullName,
        description: snapshot.description,
        private: snapshot.private,
        htmlUrl: snapshot.htmlUrl,
        defaultBranch: snapshot.defaultBranch,
        ghCreatedAt: snapshot.ghCreatedAt,
        ghUpdatedAt: snapshot.ghUpdatedAt,
        isCached: cached !== undefined,
        isTracked: cached?.tracked ?? false,
        lastSyncedAt: cached?.lastSyncedAt ?? null,
      }
    })

    return { repos }
  }

  // ─── setRepoTracked ──────────────────────────────────────────────────────

  const setRepoTracked = async (args: SetRepoTrackedArgs): Promise<SetRepoTrackedResult> => {
    const existing = await findRepoByOwnerName(args.organisationId, args.owner, args.name)

    if (existing) {
      const [row] = await db
        .update(ghRepos)
        .set({
          tracked: args.tracked,
          updatedAt: new Date(),
          // Re-tracking a soft-deleted repo undeletes it.
          deletedAt: args.tracked ? null : existing.deletedAt,
        })
        .where(eq(ghRepos.id, existing.id))
        .returning()
      if (!row)
        throw new GhRepoNotFoundError(args.organisationId, `${args.owner}/${args.name}`)
      return { repo: row }
    }

    // No local row yet — fetch metadata from GitHub before inserting. The
    // client wrapper throws `GhResourceNotFoundError` on 404; surface it as
    // `GhRepoNotFoundError` so the API layer can render "no such repo
    // visible to this workspace" rather than a generic upstream-404.
    let snapshot: RepoSnapshot
    try {
      snapshot = await ghClientService.getRepo({
        organisationId: args.organisationId,
        owner: args.owner,
        name: args.name,
      })
    }
    catch (err) {
      if (err instanceof GhResourceNotFoundError)
        throw new GhRepoNotFoundError(args.organisationId, `${args.owner}/${args.name}`)
      throw err
    }

    const connectionId = await findConnectionId(args.organisationId)
    const repo = await upsertRepoFromSnapshot(db, args.organisationId, connectionId, snapshot, {
      setTracked: args.tracked,
    })
    // The upsert preserves the existing `tracked` flag on conflict; a
    // first-insert needs the explicit value too. `setTracked` is honoured on
    // INSERT only — the conflict branch is unreachable here because we just
    // proved the row didn't exist via `findRepoByOwnerName`.
    return { repo }
  }

  // ─── syncRepo ────────────────────────────────────────────────────────────

  /**
   * Resolve the local `gh_repos` row for the supplied identifier. The job
   * (T-4.5) calls `syncRepo` with `repoId` (it iterates `gh_repos` directly);
   * the manual "Sync now" UI route (T-4.6) also has the id. We keep both
   * variants because tests find `(owner, name)` more readable.
   */
  const resolveRepo = async (args: SyncRepoArgs): Promise<GhRepo> => {
    if (args.repoId) {
      const row = await findRepoById(args.organisationId, args.repoId)
      if (!row)
        throw new GhRepoNotFoundError(args.organisationId, args.repoId)
      return row
    }
    if (args.owner && args.name) {
      const row = await findRepoByOwnerName(args.organisationId, args.owner, args.name)
      if (!row)
        throw new GhRepoNotFoundError(args.organisationId, `${args.owner}/${args.name}`)
      return row
    }
    throw new GhRepoNotFoundError(args.organisationId, '<unspecified>')
  }

  /**
   * Upsert one issue snapshot. Keyed by `(repo_id, gh_id)`. JSON columns
   * (`labels`, `assignees`, `author`) are written verbatim. The unique
   * constraint guarantees no duplicate row appears even if the open-issues
   * feed paginates oddly across two ticks.
   */
  const upsertIssue = async (
    tx: DatabaseClient,
    organisationId: string,
    repoId: string,
    snapshot: IssueSnapshot,
    now: Date,
  ): Promise<void> => {
    await tx
      .insert(ghIssues)
      .values({
        id: ulid(),
        organisationId,
        repoId,
        ghId: snapshot.ghId,
        number: snapshot.number,
        title: snapshot.title,
        body: snapshot.body,
        state: snapshot.state,
        stateReason: snapshot.stateReason,
        labels: snapshot.labels,
        assignees: snapshot.assignees,
        author: snapshot.author,
        commentsCount: snapshot.commentsCount,
        ghCreatedAt: snapshot.ghCreatedAt,
        ghUpdatedAt: snapshot.ghUpdatedAt,
        ghClosedAt: snapshot.ghClosedAt,
        htmlUrl: snapshot.htmlUrl,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [ghIssues.repoId, ghIssues.ghId],
        set: {
          number: snapshot.number,
          title: snapshot.title,
          body: snapshot.body,
          state: snapshot.state,
          stateReason: snapshot.stateReason,
          labels: snapshot.labels,
          assignees: snapshot.assignees,
          author: snapshot.author,
          commentsCount: snapshot.commentsCount,
          ghCreatedAt: snapshot.ghCreatedAt,
          ghUpdatedAt: snapshot.ghUpdatedAt,
          ghClosedAt: snapshot.ghClosedAt,
          htmlUrl: snapshot.htmlUrl,
          updatedAt: now,
        },
      })
  }

  const upsertPull = async (
    tx: DatabaseClient,
    organisationId: string,
    repoId: string,
    snapshot: PullSnapshot,
    now: Date,
  ): Promise<void> => {
    await tx
      .insert(ghPulls)
      .values({
        id: ulid(),
        organisationId,
        repoId,
        ghId: snapshot.ghId,
        number: snapshot.number,
        title: snapshot.title,
        body: snapshot.body,
        state: snapshot.state,
        draft: snapshot.draft,
        baseRef: snapshot.baseRef,
        headRef: snapshot.headRef,
        labels: snapshot.labels,
        assignees: snapshot.assignees,
        requestedReviewers: snapshot.requestedReviewers,
        author: snapshot.author,
        commentsCount: snapshot.commentsCount,
        additions: snapshot.additions,
        deletions: snapshot.deletions,
        changedFiles: snapshot.changedFiles,
        ghCreatedAt: snapshot.ghCreatedAt,
        ghUpdatedAt: snapshot.ghUpdatedAt,
        ghClosedAt: snapshot.ghClosedAt,
        ghMergedAt: snapshot.ghMergedAt,
        htmlUrl: snapshot.htmlUrl,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [ghPulls.repoId, ghPulls.ghId],
        set: {
          number: snapshot.number,
          title: snapshot.title,
          body: snapshot.body,
          state: snapshot.state,
          draft: snapshot.draft,
          baseRef: snapshot.baseRef,
          headRef: snapshot.headRef,
          labels: snapshot.labels,
          assignees: snapshot.assignees,
          requestedReviewers: snapshot.requestedReviewers,
          author: snapshot.author,
          commentsCount: snapshot.commentsCount,
          additions: snapshot.additions,
          deletions: snapshot.deletions,
          changedFiles: snapshot.changedFiles,
          ghCreatedAt: snapshot.ghCreatedAt,
          ghUpdatedAt: snapshot.ghUpdatedAt,
          ghClosedAt: snapshot.ghClosedAt,
          ghMergedAt: snapshot.ghMergedAt,
          htmlUrl: snapshot.htmlUrl,
          updatedAt: now,
        },
      })
  }

  const upsertCommit = async (
    tx: DatabaseClient,
    organisationId: string,
    repoId: string,
    snapshot: CommitSnapshot,
    now: Date,
  ): Promise<void> => {
    await tx
      .insert(ghCommits)
      .values({
        id: ulid(),
        organisationId,
        repoId,
        sha: snapshot.sha,
        message: snapshot.message,
        authorName: snapshot.authorName,
        authorEmail: snapshot.authorEmail,
        authorLogin: snapshot.authorLogin,
        authorAvatarUrl: snapshot.authorAvatarUrl,
        authoredAt: snapshot.authoredAt,
        committerLogin: snapshot.committerLogin,
        committedAt: snapshot.committedAt,
        htmlUrl: snapshot.htmlUrl,
        parents: snapshot.parents,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [ghCommits.repoId, ghCommits.sha],
        set: {
          message: snapshot.message,
          authorName: snapshot.authorName,
          authorEmail: snapshot.authorEmail,
          authorLogin: snapshot.authorLogin,
          authorAvatarUrl: snapshot.authorAvatarUrl,
          authoredAt: snapshot.authoredAt,
          committerLogin: snapshot.committerLogin,
          committedAt: snapshot.committedAt,
          htmlUrl: snapshot.htmlUrl,
          parents: snapshot.parents,
          updatedAt: now,
        },
      })
  }

  const syncRepo = async (args: SyncRepoArgs): Promise<SyncRepoResult> => {
    // Resolve the local row up-front so we can throw `GhRepoNotFoundError`
    // before spending a GitHub API call. This also pre-populates `repo.id`
    // for child upserts inside the transaction.
    const localBefore = await resolveRepo(args)

    let metadata: RepoSnapshot
    let issues: IssueSnapshot[]
    let pulls: PullSnapshot[]
    let commits: CommitSnapshot[]
    try {
      // Pull all four feeds before opening the transaction — these are
      // network calls; we don't want a long tx holding row locks across
      // GitHub round trips.
      metadata = await ghClientService.getRepo({
        organisationId: args.organisationId,
        owner: localBefore.owner,
        name: localBefore.name,
      })
      issues = await ghClientService.listIssues({
        organisationId: args.organisationId,
        owner: localBefore.owner,
        name: localBefore.name,
        state: 'open',
      })
      pulls = await ghClientService.listPulls({
        organisationId: args.organisationId,
        owner: localBefore.owner,
        name: localBefore.name,
        state: 'open',
      })
      commits = await ghClientService.listCommits({
        organisationId: args.organisationId,
        owner: localBefore.owner,
        name: localBefore.name,
        limit: 50,
      })
    }
    catch (err) {
      if (isPassThroughSyncError(err))
        throw err
      throw new GhSyncFailedError(args.organisationId, localBefore.id, errorMessage(err), { cause: err as Error })
    }

    const connectionId = await findConnectionId(args.organisationId)
    const now = new Date()

    try {
      const result = await db.transaction(async (tx) => {
        const repoRow = await upsertRepoFromSnapshot(
          tx as unknown as DatabaseClient,
          args.organisationId,
          connectionId,
          metadata,
        )

        for (const issue of issues)
          await upsertIssue(tx as unknown as DatabaseClient, args.organisationId, repoRow.id, issue, now)

        for (const pull of pulls)
          await upsertPull(tx as unknown as DatabaseClient, args.organisationId, repoRow.id, pull, now)

        for (const commit of commits)
          await upsertCommit(tx as unknown as DatabaseClient, args.organisationId, repoRow.id, commit, now)

        // Bump `last_synced_at` once child upserts succeed.
        const [bumped] = await tx
          .update(ghRepos)
          .set({ lastSyncedAt: now, updatedAt: now })
          .where(eq(ghRepos.id, repoRow.id))
          .returning()

        return {
          repo: bumped ?? repoRow,
          counts: {
            issues: issues.length,
            pulls: pulls.length,
            commits: commits.length,
          } satisfies SyncCounts,
        }
      })
      return result
    }
    catch (err) {
      if (isPassThroughSyncError(err))
        throw err
      throw new GhSyncFailedError(args.organisationId, localBefore.id, errorMessage(err), { cause: err as Error })
    }
  }

  // ─── syncAllTracked ──────────────────────────────────────────────────────

  const syncAllTracked = async (args: SyncAllTrackedArgs): Promise<SyncAllTrackedResult> => {
    const tracked = await db
      .select({ id: ghRepos.id })
      .from(ghRepos)
      .where(and(
        eq(ghRepos.organisationId, args.organisationId),
        eq(ghRepos.tracked, true),
        isNull(ghRepos.deletedAt),
      ))

    const repoResults: SyncAllTrackedRepoResult[] = []
    for (const row of tracked) {
      try {
        const { counts } = await syncRepo({ organisationId: args.organisationId, repoId: row.id })
        repoResults.push({ repoId: row.id, ok: true, counts })
      }
      catch (err) {
        // REQ-PROJ-3 implication: the cron must keep going if one repo's
        // access has been revoked, the rate limit was hit while listing one
        // repo's commits, etc. Each failure is recorded with a stringified
        // reason for the audit log / UI surfacing.
        repoResults.push({ repoId: row.id, ok: false, error: errorMessage(err) })
      }
    }
    return { repoResults }
  }

  // ─── purgeRepo ───────────────────────────────────────────────────────────

  const purgeRepo = async (args: PurgeRepoArgs): Promise<void> => {
    const row = await findRepoById(args.organisationId, args.repoId)
    if (!row)
      throw new GhRepoNotFoundError(args.organisationId, args.repoId)

    await db.transaction(async (tx) => {
      // Hard-delete cached children. Issues/pulls/commits are cheap to
      // re-pull on a future re-track and large to keep around for a soft-
      // deleted repo — see the module-level "purge semantics" comment.
      await tx.delete(ghCommits).where(eq(ghCommits.repoId, row.id))
      await tx.delete(ghIssues).where(eq(ghIssues.repoId, row.id))
      await tx.delete(ghPulls).where(eq(ghPulls.repoId, row.id))

      // Soft-delete the repo row, also clearing `tracked` so subsequent
      // `syncAllTracked` ticks don't pick it up.
      await tx
        .update(ghRepos)
        .set({
          tracked: false,
          deletedAt: sql`now()`,
          updatedAt: sql`now()`,
        })
        .where(eq(ghRepos.id, row.id))
    })
  }

  return {
    listAccessibleRepos,
    setRepoTracked,
    syncRepo,
    syncAllTracked,
    purgeRepo,
  }
}

export type GhSyncService = ReturnType<typeof createGhSyncService>
