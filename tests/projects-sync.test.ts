import type {
  CommitSnapshot,
  IssueSnapshot,
  PullSnapshot,
  RepoSnapshot,
} from '../server/features/projects/types'
import { and, eq, sql } from 'drizzle-orm'
import { ulid } from 'ulid'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import * as schema from '../server/database/schema'
import {
  GhRepoNotFoundError,
  GhResourceNotFoundError,
  GhSyncFailedError,
} from '../server/features/projects/errors'
import { createGhSyncService } from '../server/features/projects/sync.service'
import { getDatabase } from '../server/infrastructure/database/client'
import { createOrganisationData } from './factories'

// ─── Mock ghClientService / ghConnectionsService ────────────────────────────
//
// The sync service only consumes a tiny subset of `GhClientService`; we use a
// hand-rolled stub that exposes vi.fn for each method. `ghConnectionsService`
// isn't actually called by sync (the client wrapper does that internally) but
// the DI shape requires it — pass an empty stub.

const mocks = vi.hoisted(() => ({
  listAccessibleRepos: vi.fn<(orgId: string) => Promise<RepoSnapshot[]>>(),
  getRepo: vi.fn<(args: { organisationId: string, owner: string, name: string }) => Promise<RepoSnapshot>>(),
  listIssues: vi.fn<(args: { organisationId: string, owner: string, name: string, state?: 'open' | 'closed' | 'all' }) => Promise<IssueSnapshot[]>>(),
  listPulls: vi.fn<(args: { organisationId: string, owner: string, name: string, state?: 'open' | 'closed' | 'all' }) => Promise<PullSnapshot[]>>(),
  listCommits: vi.fn<(args: { organisationId: string, owner: string, name: string, limit?: number }) => Promise<CommitSnapshot[]>>(),
}))

const ghClientStub = {
  listAccessibleRepos: mocks.listAccessibleRepos,
  getRepo: mocks.getRepo,
  listIssues: mocks.listIssues,
  listPulls: mocks.listPulls,
  listCommits: mocks.listCommits,
}

const ghConnectionsStub = {
  getConnectionContext: vi.fn(),
}

const db = getDatabase('app')

// ─── Helpers ────────────────────────────────────────────────────────────────

const cleanProjectsTables = async () => {
  await db.execute(sql`TRUNCATE TABLE
    gh_commits,
    gh_issues,
    gh_pulls,
    gh_repos,
    gh_connections
    CASCADE`)
}

interface OrgFixture {
  orgId: string
  connectionId: string
}

const seedOrg = async (): Promise<OrgFixture> => {
  const orgData = createOrganisationData()
  const orgId = ulid()
  await db.insert(schema.organisations).values({
    id: orgId,
    name: orgData.name,
    slug: `${orgData.slug}-${orgId.slice(-6).toLowerCase()}`,
    cryptoSalt: orgData.cryptoSalt,
  })

  const connectionId = ulid()
  await db.insert(schema.ghConnections).values({
    id: connectionId,
    organisationId: orgId,
    tokenEncrypted: 'fake-encrypted-token',
    ghUserLogin: 'octocat',
    ghUserId: 1,
    scopes: ['repo'],
    lastValidatedAt: new Date(),
  })

  return { orgId, connectionId }
}

const sampleRepoSnapshot = (overrides: Partial<RepoSnapshot> = {}): RepoSnapshot => ({
  ghId: 12345,
  owner: 'octocat',
  name: 'hello',
  fullName: 'octocat/hello',
  description: 'a repo',
  private: true,
  defaultBranch: 'main',
  htmlUrl: 'https://github.com/octocat/hello',
  ghCreatedAt: new Date('2024-01-01T00:00:00Z'),
  ghUpdatedAt: new Date('2024-06-01T12:34:56Z'),
  ...overrides,
})

const sampleIssueSnapshot = (overrides: Partial<IssueSnapshot> = {}): IssueSnapshot => ({
  ghId: 1001,
  number: 1,
  title: 'Bug',
  body: 'broken',
  state: 'open',
  stateReason: null,
  labels: ['bug'],
  assignees: [],
  author: { login: 'reporter' },
  commentsCount: 0,
  ghCreatedAt: new Date('2024-02-01T00:00:00Z'),
  ghUpdatedAt: new Date('2024-02-02T00:00:00Z'),
  ghClosedAt: null,
  htmlUrl: 'https://github.com/octocat/hello/issues/1',
  ...overrides,
})

const samplePullSnapshot = (overrides: Partial<PullSnapshot> = {}): PullSnapshot => ({
  ghId: 2001,
  number: 5,
  title: 'Feature',
  body: 'adds X',
  state: 'open',
  draft: false,
  baseRef: 'main',
  headRef: 'feature',
  labels: [],
  assignees: [],
  requestedReviewers: [],
  author: { login: 'submitter' },
  commentsCount: 0,
  additions: null,
  deletions: null,
  changedFiles: null,
  ghCreatedAt: new Date('2024-03-01T00:00:00Z'),
  ghUpdatedAt: new Date('2024-03-02T00:00:00Z'),
  ghClosedAt: null,
  ghMergedAt: null,
  htmlUrl: 'https://github.com/octocat/hello/pull/5',
  ...overrides,
})

const sampleCommitSnapshot = (overrides: Partial<CommitSnapshot> = {}): CommitSnapshot => ({
  sha: 'a'.repeat(40),
  message: 'init',
  authorName: 'Alice',
  authorEmail: 'a@x.com',
  authorLogin: 'alice',
  authorAvatarUrl: 'a.png',
  authoredAt: new Date('2024-04-01T00:00:00Z'),
  committerLogin: 'alice',
  committedAt: new Date('2024-04-01T00:00:00Z'),
  htmlUrl: 'https://github.com/octocat/hello/commit/aaa',
  parents: ['b'.repeat(40)],
  ...overrides,
})

// ─── Test setup ─────────────────────────────────────────────────────────────

let fx: OrgFixture
let service: ReturnType<typeof createGhSyncService>

beforeEach(async () => {
  await cleanProjectsTables()
  Object.values(mocks).forEach(m => m.mockReset())
  service = createGhSyncService({
    db,
    ghClientService: ghClientStub,
    ghConnectionsService: ghConnectionsStub as never,
  })
  fx = await seedOrg()
})

// ─── listAccessibleRepos ────────────────────────────────────────────────────

describe('ghSyncService.listAccessibleRepos', () => {
  it('joins remote feed with local cache: cached/uncached/tracked mix', async () => {
    const remote = [
      sampleRepoSnapshot({ ghId: 1, name: 'cached-tracked', fullName: 'octocat/cached-tracked' }),
      sampleRepoSnapshot({ ghId: 2, name: 'cached-untracked', fullName: 'octocat/cached-untracked' }),
      sampleRepoSnapshot({ ghId: 3, name: 'uncached', fullName: 'octocat/uncached' }),
    ]
    mocks.listAccessibleRepos.mockResolvedValueOnce(remote)

    const lastSync = new Date('2024-05-01T00:00:00Z')
    await db.insert(schema.ghRepos).values([
      {
        id: ulid(),
        organisationId: fx.orgId,
        connectionId: fx.connectionId,
        ghId: 1,
        owner: 'octocat',
        name: 'cached-tracked',
        fullName: 'octocat/cached-tracked',
        private: true,
        tracked: true,
        lastSyncedAt: lastSync,
      },
      {
        id: ulid(),
        organisationId: fx.orgId,
        connectionId: fx.connectionId,
        ghId: 2,
        owner: 'octocat',
        name: 'cached-untracked',
        fullName: 'octocat/cached-untracked',
        private: true,
        tracked: false,
      },
    ])

    const { repos } = await service.listAccessibleRepos({ organisationId: fx.orgId })

    expect(repos).toHaveLength(3)
    const byId = new Map(repos.map(r => [r.ghId, r]))
    expect(byId.get(1)).toMatchObject({ isCached: true, isTracked: true, lastSyncedAt: lastSync })
    expect(byId.get(2)).toMatchObject({ isCached: true, isTracked: false, lastSyncedAt: null })
    expect(byId.get(3)).toMatchObject({ isCached: false, isTracked: false, lastSyncedAt: null })
  })

  it('treats soft-deleted cache rows as absent', async () => {
    mocks.listAccessibleRepos.mockResolvedValueOnce([
      sampleRepoSnapshot({ ghId: 7 }),
    ])
    await db.insert(schema.ghRepos).values({
      id: ulid(),
      organisationId: fx.orgId,
      connectionId: fx.connectionId,
      ghId: 7,
      owner: 'octocat',
      name: 'hello',
      fullName: 'octocat/hello',
      private: true,
      tracked: true,
      deletedAt: new Date(),
    })

    const { repos } = await service.listAccessibleRepos({ organisationId: fx.orgId })
    expect(repos[0]).toMatchObject({ isCached: false, isTracked: false })
  })
})

// ─── setRepoTracked ─────────────────────────────────────────────────────────

describe('ghSyncService.setRepoTracked', () => {
  it('inserts a stub row with tracked=true when missing, fetching metadata via getRepo', async () => {
    mocks.getRepo.mockResolvedValueOnce(sampleRepoSnapshot({ ghId: 42, name: 'newrepo', fullName: 'octocat/newrepo' }))

    const { repo } = await service.setRepoTracked({
      organisationId: fx.orgId,
      owner: 'octocat',
      name: 'newrepo',
      tracked: true,
    })

    expect(repo.tracked).toBe(true)
    expect(repo.ghId).toBe(42)
    expect(mocks.getRepo).toHaveBeenCalledOnce()

    const rows = await db
      .select()
      .from(schema.ghRepos)
      .where(eq(schema.ghRepos.organisationId, fx.orgId))
    expect(rows).toHaveLength(1)
    expect(rows[0]?.tracked).toBe(true)
  })

  it('flips tracked flag on an existing row without re-fetching', async () => {
    await db.insert(schema.ghRepos).values({
      id: ulid(),
      organisationId: fx.orgId,
      connectionId: fx.connectionId,
      ghId: 99,
      owner: 'octocat',
      name: 'existing',
      fullName: 'octocat/existing',
      private: true,
      tracked: false,
    })

    const { repo } = await service.setRepoTracked({
      organisationId: fx.orgId,
      owner: 'octocat',
      name: 'existing',
      tracked: true,
    })

    expect(repo.tracked).toBe(true)
    expect(mocks.getRepo).not.toHaveBeenCalled()
  })

  it('flips tracked=false but row remains', async () => {
    await db.insert(schema.ghRepos).values({
      id: ulid(),
      organisationId: fx.orgId,
      connectionId: fx.connectionId,
      ghId: 99,
      owner: 'octocat',
      name: 'existing',
      fullName: 'octocat/existing',
      private: true,
      tracked: true,
    })

    const { repo } = await service.setRepoTracked({
      organisationId: fx.orgId,
      owner: 'octocat',
      name: 'existing',
      tracked: false,
    })

    expect(repo.tracked).toBe(false)

    const rows = await db
      .select()
      .from(schema.ghRepos)
      .where(eq(schema.ghRepos.organisationId, fx.orgId))
    expect(rows).toHaveLength(1)
    expect(rows[0]?.deletedAt).toBeNull()
  })

  it('throws GhRepoNotFoundError when GitHub returns 404 for a missing local row', async () => {
    mocks.getRepo.mockRejectedValueOnce(new GhResourceNotFoundError(fx.orgId, 'octocat/nope'))

    await expect(
      service.setRepoTracked({
        organisationId: fx.orgId,
        owner: 'octocat',
        name: 'nope',
        tracked: true,
      }),
    ).rejects.toBeInstanceOf(GhRepoNotFoundError)
  })
})

// ─── syncRepo ───────────────────────────────────────────────────────────────

describe('ghSyncService.syncRepo', () => {
  const seedTrackedRepo = async (): Promise<string> => {
    const repoId = ulid()
    await db.insert(schema.ghRepos).values({
      id: repoId,
      organisationId: fx.orgId,
      connectionId: fx.connectionId,
      ghId: 12345,
      owner: 'octocat',
      name: 'hello',
      fullName: 'octocat/hello',
      private: true,
      tracked: true,
    })
    return repoId
  }

  const installHappyMocks = (overrides: {
    metadata?: RepoSnapshot
    issues?: IssueSnapshot[]
    pulls?: PullSnapshot[]
    commits?: CommitSnapshot[]
  } = {}) => {
    mocks.getRepo.mockResolvedValueOnce(overrides.metadata ?? sampleRepoSnapshot())
    mocks.listIssues.mockResolvedValueOnce(overrides.issues ?? [sampleIssueSnapshot()])
    mocks.listPulls.mockResolvedValueOnce(overrides.pulls ?? [samplePullSnapshot()])
    mocks.listCommits.mockResolvedValueOnce(overrides.commits ?? [sampleCommitSnapshot()])
  }

  it('happy path: upserts metadata + issues + pulls + commits, bumps last_synced_at, returns counts', async () => {
    const repoId = await seedTrackedRepo()
    installHappyMocks()

    const result = await service.syncRepo({ organisationId: fx.orgId, repoId })

    expect(result.counts).toEqual({ issues: 1, pulls: 1, commits: 1 })
    expect(result.repo.lastSyncedAt).toBeInstanceOf(Date)

    const issues = await db.select().from(schema.ghIssues).where(eq(schema.ghIssues.repoId, repoId))
    expect(issues).toHaveLength(1)
    const pulls = await db.select().from(schema.ghPulls).where(eq(schema.ghPulls.repoId, repoId))
    expect(pulls).toHaveLength(1)
    const commits = await db.select().from(schema.ghCommits).where(eq(schema.ghCommits.repoId, repoId))
    expect(commits).toHaveLength(1)

    expect(mocks.listCommits).toHaveBeenCalledWith(expect.objectContaining({ limit: 50 }))
    expect(mocks.listIssues).toHaveBeenCalledWith(expect.objectContaining({ state: 'open' }))
    expect(mocks.listPulls).toHaveBeenCalledWith(expect.objectContaining({ state: 'open' }))
  })

  it('idempotent: a re-sync with the same payloads does not duplicate rows', async () => {
    const repoId = await seedTrackedRepo()
    installHappyMocks()
    await service.syncRepo({ organisationId: fx.orgId, repoId })

    installHappyMocks()
    await service.syncRepo({ organisationId: fx.orgId, repoId })

    const issues = await db.select().from(schema.ghIssues).where(eq(schema.ghIssues.repoId, repoId))
    const pulls = await db.select().from(schema.ghPulls).where(eq(schema.ghPulls.repoId, repoId))
    const commits = await db.select().from(schema.ghCommits).where(eq(schema.ghCommits.repoId, repoId))
    expect(issues).toHaveLength(1)
    expect(pulls).toHaveLength(1)
    expect(commits).toHaveLength(1)
  })

  it('reclassifies a PR open → merged on re-sync', async () => {
    const repoId = await seedTrackedRepo()

    installHappyMocks({
      pulls: [samplePullSnapshot({ ghId: 7, number: 7, state: 'open' })],
    })
    await service.syncRepo({ organisationId: fx.orgId, repoId })

    const merged = samplePullSnapshot({
      ghId: 7,
      number: 7,
      state: 'merged',
      ghMergedAt: new Date('2024-04-01T00:00:00Z'),
      ghClosedAt: new Date('2024-04-01T00:00:00Z'),
    })
    installHappyMocks({ pulls: [merged] })
    await service.syncRepo({ organisationId: fx.orgId, repoId })

    const pulls = await db.select().from(schema.ghPulls).where(eq(schema.ghPulls.repoId, repoId))
    expect(pulls).toHaveLength(1)
    expect(pulls[0]?.state).toBe('merged')
    expect(pulls[0]?.ghMergedAt).toBeInstanceOf(Date)
  })

  it('does not delete rows missing from a subsequent feed (closed-issue retention)', async () => {
    const repoId = await seedTrackedRepo()

    installHappyMocks({
      issues: [sampleIssueSnapshot({ ghId: 100, number: 1 })],
    })
    await service.syncRepo({ organisationId: fx.orgId, repoId })

    // Second sync — issue closed upstream, no longer in `state=open` feed.
    installHappyMocks({ issues: [] })
    await service.syncRepo({ organisationId: fx.orgId, repoId })

    const issues = await db.select().from(schema.ghIssues).where(eq(schema.ghIssues.repoId, repoId))
    expect(issues).toHaveLength(1)
    expect(issues[0]?.state).toBe('open') // stale but preserved
  })

  it('throws GhRepoNotFoundError when the local row does not exist', async () => {
    await expect(
      service.syncRepo({ organisationId: fx.orgId, repoId: ulid() }),
    ).rejects.toBeInstanceOf(GhRepoNotFoundError)
    expect(mocks.getRepo).not.toHaveBeenCalled()
  })

  it('wraps unexpected client errors as GhSyncFailedError', async () => {
    const repoId = await seedTrackedRepo()
    mocks.getRepo.mockRejectedValueOnce(new Error('boom'))

    await expect(
      service.syncRepo({ organisationId: fx.orgId, repoId }),
    ).rejects.toBeInstanceOf(GhSyncFailedError)
  })
})

// ─── syncAllTracked ─────────────────────────────────────────────────────────

describe('ghSyncService.syncAllTracked', () => {
  it('iterates tracked repos, skips untracked, continues on per-repo failure', async () => {
    const trackedOk = ulid()
    const trackedFail = ulid()
    const untracked = ulid()
    await db.insert(schema.ghRepos).values([
      {
        id: trackedOk,
        organisationId: fx.orgId,
        connectionId: fx.connectionId,
        ghId: 1,
        owner: 'octocat',
        name: 'ok',
        fullName: 'octocat/ok',
        private: true,
        tracked: true,
      },
      {
        id: trackedFail,
        organisationId: fx.orgId,
        connectionId: fx.connectionId,
        ghId: 2,
        owner: 'octocat',
        name: 'fail',
        fullName: 'octocat/fail',
        private: true,
        tracked: true,
      },
      {
        id: untracked,
        organisationId: fx.orgId,
        connectionId: fx.connectionId,
        ghId: 3,
        owner: 'octocat',
        name: 'untracked',
        fullName: 'octocat/untracked',
        private: true,
        tracked: false,
      },
    ])

    // First repo (sorted by ULID — trackedOk created first) succeeds; second fails.
    // We can't rely on iteration order, so set up mocks per-repo via implementation.
    mocks.getRepo.mockImplementation(async (args) => {
      if (args.name === 'fail')
        throw new Error('upstream blew up')
      return sampleRepoSnapshot({ ghId: args.name === 'ok' ? 1 : 0, name: args.name, fullName: `${args.owner}/${args.name}` })
    })
    mocks.listIssues.mockResolvedValue([])
    mocks.listPulls.mockResolvedValue([])
    mocks.listCommits.mockResolvedValue([])

    const { repoResults } = await service.syncAllTracked({ organisationId: fx.orgId })

    expect(repoResults).toHaveLength(2)
    const byId = new Map(repoResults.map(r => [r.repoId, r]))
    expect(byId.get(trackedOk)?.ok).toBe(true)
    expect(byId.get(trackedFail)?.ok).toBe(false)
    expect(byId.has(untracked)).toBe(false)
  })

  it('skips soft-deleted tracked repos', async () => {
    await db.insert(schema.ghRepos).values({
      id: ulid(),
      organisationId: fx.orgId,
      connectionId: fx.connectionId,
      ghId: 1,
      owner: 'octocat',
      name: 'soft-deleted',
      fullName: 'octocat/soft-deleted',
      private: true,
      tracked: true,
      deletedAt: new Date(),
    })

    const { repoResults } = await service.syncAllTracked({ organisationId: fx.orgId })
    expect(repoResults).toHaveLength(0)
  })
})

// ─── purgeRepo ──────────────────────────────────────────────────────────────

describe('ghSyncService.purgeRepo', () => {
  it('soft-deletes the repo row, hard-deletes children, clears tracked', async () => {
    const repoId = ulid()
    await db.insert(schema.ghRepos).values({
      id: repoId,
      organisationId: fx.orgId,
      connectionId: fx.connectionId,
      ghId: 12345,
      owner: 'octocat',
      name: 'hello',
      fullName: 'octocat/hello',
      private: true,
      tracked: true,
    })
    await db.insert(schema.ghIssues).values({
      id: ulid(),
      organisationId: fx.orgId,
      repoId,
      ghId: 1,
      number: 1,
      title: 'Bug',
      state: 'open',
      labels: [],
      assignees: [],
      author: { login: 'r' },
      commentsCount: 0,
      htmlUrl: 'https://x',
    })
    await db.insert(schema.ghPulls).values({
      id: ulid(),
      organisationId: fx.orgId,
      repoId,
      ghId: 1,
      number: 1,
      title: 'PR',
      state: 'open',
      draft: false,
      baseRef: 'main',
      headRef: 'feat',
      labels: [],
      assignees: [],
      requestedReviewers: [],
      author: { login: 'r' },
      commentsCount: 0,
      htmlUrl: 'https://x',
    })
    await db.insert(schema.ghCommits).values({
      id: ulid(),
      organisationId: fx.orgId,
      repoId,
      sha: 'a'.repeat(40),
      message: 'init',
      htmlUrl: 'https://x',
      parents: [],
    })

    await service.purgeRepo({ organisationId: fx.orgId, repoId })

    const repoRow = await db
      .select()
      .from(schema.ghRepos)
      .where(eq(schema.ghRepos.id, repoId))
    expect(repoRow).toHaveLength(1)
    expect(repoRow[0]?.deletedAt).toBeInstanceOf(Date)
    expect(repoRow[0]?.tracked).toBe(false)

    const issues = await db.select().from(schema.ghIssues).where(eq(schema.ghIssues.repoId, repoId))
    const pulls = await db.select().from(schema.ghPulls).where(eq(schema.ghPulls.repoId, repoId))
    const commits = await db.select().from(schema.ghCommits).where(eq(schema.ghCommits.repoId, repoId))
    expect(issues).toHaveLength(0)
    expect(pulls).toHaveLength(0)
    expect(commits).toHaveLength(0)
  })

  it('throws GhRepoNotFoundError for an unknown repoId', async () => {
    await expect(
      service.purgeRepo({ organisationId: fx.orgId, repoId: ulid() }),
    ).rejects.toBeInstanceOf(GhRepoNotFoundError)
  })
})

// Trivial dummy to keep `and` import alive (used elsewhere if needed)
void and
