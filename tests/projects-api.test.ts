import type { GhConnectionsService } from '../server/features/projects/connections.service'
/**
 * DB-backed integration tests for the projects API surface (T-4.6).
 *
 * Mirrors `tests/orchestrator-audit-api.test.ts`: the project doesn't expose
 * an h3-level test harness (see `tests/setup.ts`), so we exercise:
 *   - The read service (`ghProjectsReadService`) for workspace scoping,
 *     filter combos, pagination, total accuracy, and the cross-org 404
 *     contract (returns null → API maps to 404).
 *   - The schema layer (`api-schemas.ts`) — repeatable params, ISO date
 *     parsing, body validation.
 *   - The RBAC seed — Owner / Admin grant `project:manage`; Member only
 *     grants `project:read`. This locks down the "403 for read-only callers
 *     hitting manage routes" promise without needing an HTTP harness.
 *
 * The HTTP route handlers are thin wrappers around these surfaces plus
 * `requirePermission` (already covered by the rbac integration tests). The
 * route-shape contract is enforced by `pnpm typecheck` against the
 * `defineEventHandler` signatures.
 */
import type { GhClientService } from '../server/features/projects/github-client'
import { sql } from 'drizzle-orm'
import { ulid } from 'ulid'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import * as schema from '../server/database/schema'
import {
  commitsListQuerySchema,
  connectBodySchema,
  issuesListQuerySchema,
  pullsListQuerySchema,
  repoPatchBodySchema,
  reposListQuerySchema,
  revokeQuerySchema,
  serialiseAccessibleRepo,
  serialiseCommit,
  serialiseConnectionStatus,
  serialiseIssue,
  serialisePull,
  serialiseRepo,
} from '../server/features/projects/api-schemas'
import { createGhProjectsReadService } from '../server/features/projects/read.service'
import { createGhSyncService } from '../server/features/projects/sync.service'
import { PERMISSIONS } from '../server/features/rbac/permissions'
import { DEFAULT_ROLES } from '../server/features/rbac/rbac.seed'
import { getDatabase } from '../server/infrastructure/database/client'
import { createOrganisationData } from './factories'

const db = getDatabase('app')

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

const insertRepo = async (
  orgId: string,
  overrides: Partial<typeof schema.ghRepos.$inferInsert> = {},
): Promise<string> => {
  const id = overrides.id ?? ulid()
  await db.insert(schema.ghRepos).values({
    id,
    organisationId: orgId,
    ghId: overrides.ghId ?? Math.floor(Math.random() * 1_000_000),
    owner: 'octocat',
    name: 'hello',
    fullName: 'octocat/hello',
    private: true,
    tracked: false,
    ...overrides,
  })
  return id
}

const insertIssue = async (
  orgId: string,
  repoId: string,
  overrides: Partial<typeof schema.ghIssues.$inferInsert> = {},
) => {
  await db.insert(schema.ghIssues).values({
    id: ulid(),
    organisationId: orgId,
    repoId,
    ghId: overrides.ghId ?? Math.floor(Math.random() * 1_000_000),
    number: overrides.number ?? 1,
    title: 'an issue',
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
}

const insertPull = async (
  orgId: string,
  repoId: string,
  overrides: Partial<typeof schema.ghPulls.$inferInsert> = {},
) => {
  await db.insert(schema.ghPulls).values({
    id: ulid(),
    organisationId: orgId,
    repoId,
    ghId: overrides.ghId ?? Math.floor(Math.random() * 1_000_000),
    number: overrides.number ?? 1,
    title: 'a pull',
    body: 'changes',
    state: 'open',
    draft: false,
    baseRef: 'main',
    headRef: 'feature',
    labels: ['bug'],
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
    htmlUrl: 'https://github.com/octocat/hello/pull/1',
    ...overrides,
  })
}

const insertCommit = async (
  orgId: string,
  repoId: string,
  overrides: Partial<typeof schema.ghCommits.$inferInsert> = {},
) => {
  await db.insert(schema.ghCommits).values({
    id: ulid(),
    organisationId: orgId,
    repoId,
    sha: overrides.sha ?? `sha-${Math.random().toString(36).slice(2, 14)}`,
    message: 'a commit',
    authorName: 'Alice',
    authorEmail: 'a@x.com',
    authorLogin: 'alice',
    authorAvatarUrl: null,
    authoredAt: new Date('2024-04-01T00:00:00Z'),
    committerLogin: 'alice',
    committedAt: new Date('2024-04-01T00:00:00Z'),
    htmlUrl: 'https://github.com/octocat/hello/commit/abc',
    parents: [],
    ...overrides,
  })
}

const readService = createGhProjectsReadService({ db })

beforeEach(async () => {
  await cleanProjectsTables()
})

// ─── Schema layer ───────────────────────────────────────────────────────────

describe('projects-api schemas', () => {
  it('connectBodySchema rejects empty / whitespace tokens', () => {
    expect(connectBodySchema.safeParse({ token: '' }).success).toBe(false)
    expect(connectBodySchema.safeParse({ token: '   ' }).success).toBe(false)
    expect(connectBodySchema.safeParse({ token: 'ghp_xxx' }).success).toBe(true)
  })

  it('revokeQuerySchema parses string "true"/"false" / boolean to boolean', () => {
    expect(revokeQuerySchema.parse({ purgeData: 'true' }).purgeData).toBe(true)
    expect(revokeQuerySchema.parse({ purgeData: 'false' }).purgeData).toBe(false)
    expect(revokeQuerySchema.parse({ purgeData: '1' }).purgeData).toBe(true)
    expect(revokeQuerySchema.parse({ purgeData: '0' }).purgeData).toBe(false)
    expect(revokeQuerySchema.parse({ purgeData: true }).purgeData).toBe(true)
    expect(revokeQuerySchema.parse({}).purgeData).toBeUndefined()
  })

  it('reposListQuerySchema coerces limit/offset and validates source', () => {
    const ok = reposListQuerySchema.parse({
      source: 'github',
      tracked: 'true',
      limit: '25',
      offset: '50',
    })
    expect(ok).toMatchObject({ source: 'github', tracked: true, limit: 25, offset: 50 })

    const bad = reposListQuerySchema.safeParse({ source: 'invalid' })
    expect(bad.success).toBe(false)

    const tooMany = reposListQuerySchema.safeParse({ limit: '500' })
    expect(tooMany.success).toBe(false)
  })

  it('repoPatchBodySchema requires `tracked` and rejects extra fields', () => {
    expect(repoPatchBodySchema.safeParse({ tracked: true }).success).toBe(true)
    expect(repoPatchBodySchema.safeParse({}).success).toBe(false)
    expect(repoPatchBodySchema.safeParse({ tracked: true, ignored: 'x' }).success).toBe(false)
  })

  it('issuesListQuerySchema accepts repeated labels, defaults state undefined', () => {
    const single = issuesListQuerySchema.parse({ labels: 'bug' })
    expect(single.labels).toEqual(['bug'])
    const multi = issuesListQuerySchema.parse({ labels: ['bug', 'good first issue'] })
    expect(multi.labels).toEqual(['bug', 'good first issue'])
    const empty = issuesListQuerySchema.parse({})
    expect(empty.state).toBeUndefined()
    expect(empty.labels).toBeUndefined()
  })

  it('pullsListQuerySchema accepts merged state', () => {
    expect(pullsListQuerySchema.safeParse({ state: 'merged' }).success).toBe(true)
    expect(pullsListQuerySchema.safeParse({ state: 'open' }).success).toBe(true)
    expect(pullsListQuerySchema.safeParse({ state: 'invalid' }).success).toBe(false)
  })

  it('commitsListQuerySchema rejects malformed since', () => {
    expect(commitsListQuerySchema.safeParse({ since: 'yesterday' }).success).toBe(false)
    expect(commitsListQuerySchema.safeParse({ since: '2024-01-01T00:00:00Z' }).success).toBe(true)
  })
})

// ─── Serialisers ────────────────────────────────────────────────────────────

describe('projects-api serialisers', () => {
  it('serialiseConnectionStatus collapses to `{ connected: false }` when missing', () => {
    expect(serialiseConnectionStatus({ connected: false })).toEqual({ connected: false })
  })

  it('serialiseConnectionStatus emits ISO strings for dates', () => {
    const out = serialiseConnectionStatus({
      connected: true,
      ghUserLogin: 'octocat',
      ghUserId: 1,
      scopes: ['repo'],
      lastValidatedAt: new Date('2024-01-01T00:00:00Z'),
      updatedAt: new Date('2024-02-01T00:00:00Z'),
    })
    expect(out.lastValidatedAt).toBe('2024-01-01T00:00:00.000Z')
    expect(out.updatedAt).toBe('2024-02-01T00:00:00.000Z')
  })

  it('serialiseRepo / Issue / Pull / Commit emit ISO strings, preserve nulls', async () => {
    const fx = await seedOrg()
    const repoId = await insertRepo(fx.orgId, { lastSyncedAt: new Date('2024-05-01T00:00:00Z') })
    const repos = await db.select().from(schema.ghRepos)
    const sRepo = serialiseRepo(repos[0]!)
    expect(sRepo.lastSyncedAt).toBe('2024-05-01T00:00:00.000Z')
    expect(sRepo.deletedAt).toBeNull()

    await insertIssue(fx.orgId, repoId)
    const issues = await db.select().from(schema.ghIssues)
    const sIssue = serialiseIssue(issues[0]!)
    expect(sIssue.ghClosedAt).toBeNull()
    expect(sIssue.ghCreatedAt).toBe('2024-02-01T00:00:00.000Z')

    await insertPull(fx.orgId, repoId)
    const pulls = await db.select().from(schema.ghPulls)
    const sPull = serialisePull(pulls[0]!)
    expect(sPull.ghMergedAt).toBeNull()

    await insertCommit(fx.orgId, repoId)
    const commits = await db.select().from(schema.ghCommits)
    const sCommit = serialiseCommit(commits[0]!)
    expect(sCommit.authoredAt).toBe('2024-04-01T00:00:00.000Z')
    expect(sCommit.authorAvatarUrl).toBeNull()
  })

  it('serialiseAccessibleRepo handles null upstream timestamps', () => {
    const out = serialiseAccessibleRepo({
      ghId: 1,
      owner: 'octocat',
      name: 'a',
      fullName: 'octocat/a',
      description: null,
      private: true,
      htmlUrl: 'https://github.com/octocat/a',
      defaultBranch: null,
      ghCreatedAt: null,
      ghUpdatedAt: null,
      isCached: false,
      isTracked: false,
      lastSyncedAt: null,
    })
    expect(out.ghCreatedAt).toBeNull()
    expect(out.lastSyncedAt).toBeNull()
  })
})

// ─── Read service: repos ────────────────────────────────────────────────────

describe('ghProjectsReadService.listRepos', () => {
  it('scopes by organisationId and excludes soft-deleted by default', async () => {
    const a = await seedOrg()
    const b = await seedOrg()
    await insertRepo(a.orgId, { ghId: 1, fullName: 'octocat/a1' })
    await insertRepo(a.orgId, { ghId: 2, fullName: 'octocat/a2', deletedAt: new Date() })
    await insertRepo(b.orgId, { ghId: 3, fullName: 'octocat/b1' })

    const { rows, total } = await readService.listRepos({ organisationId: a.orgId })
    expect(total).toBe(1)
    expect(rows.map(r => r.fullName)).toEqual(['octocat/a1'])
  })

  it('filters by tracked, applies q LIKE on full_name', async () => {
    const fx = await seedOrg()
    await insertRepo(fx.orgId, { ghId: 1, fullName: 'octocat/api', tracked: true })
    await insertRepo(fx.orgId, { ghId: 2, fullName: 'octocat/web', tracked: true })
    await insertRepo(fx.orgId, { ghId: 3, fullName: 'octocat/docs', tracked: false })

    const tracked = await readService.listRepos({
      organisationId: fx.orgId,
      filter: { tracked: true },
    })
    expect(tracked.total).toBe(2)

    const search = await readService.listRepos({
      organisationId: fx.orgId,
      filter: { q: 'api' },
    })
    expect(search.total).toBe(1)
    expect(search.rows[0]!.fullName).toBe('octocat/api')
  })

  it('paginates and clamps limits to max', async () => {
    const fx = await seedOrg()
    for (let i = 0; i < 5; i += 1)
      await insertRepo(fx.orgId, { ghId: i + 1, fullName: `octocat/r${i}` })

    const page1 = await readService.listRepos({
      organisationId: fx.orgId,
      pagination: { limit: 2, offset: 0 },
    })
    expect(page1.total).toBe(5)
    expect(page1.rows).toHaveLength(2)
    const page2 = await readService.listRepos({
      organisationId: fx.orgId,
      pagination: { limit: 2, offset: 4 },
    })
    expect(page2.rows).toHaveLength(1)

    // Negative offset clamps to 0; over-limit clamps to max.
    const huge = await readService.listRepos({
      organisationId: fx.orgId,
      pagination: { limit: 99999, offset: -3 },
    })
    expect(huge.rows).toHaveLength(5)
  })
})

describe('ghProjectsReadService.getRepo', () => {
  it('returns row for live repo, null for cross-org / soft-deleted', async () => {
    const a = await seedOrg()
    const b = await seedOrg()
    const aRepo = await insertRepo(a.orgId)
    const bRepo = await insertRepo(b.orgId)
    const deletedRepo = await insertRepo(a.orgId, { deletedAt: new Date() })

    expect(await readService.getRepo({ organisationId: a.orgId, repoId: aRepo })).not.toBeNull()
    expect(await readService.getRepo({ organisationId: a.orgId, repoId: bRepo })).toBeNull()
    expect(await readService.getRepo({ organisationId: a.orgId, repoId: deletedRepo })).toBeNull()
    expect(await readService.getRepo({ organisationId: a.orgId, repoId: 'unknown-id' })).toBeNull()
  })
})

// ─── Read service: issues ───────────────────────────────────────────────────

describe('ghProjectsReadService.listIssues', () => {
  it('returns null for cross-org / soft-deleted repoId (API maps to 404)', async () => {
    const a = await seedOrg()
    const b = await seedOrg()
    const bRepo = await insertRepo(b.orgId)
    expect(await readService.listIssues({ organisationId: a.orgId, repoId: bRepo })).toBeNull()

    const deletedRepo = await insertRepo(a.orgId, { deletedAt: new Date() })
    expect(await readService.listIssues({ organisationId: a.orgId, repoId: deletedRepo })).toBeNull()
  })

  it('defaults state=open, supports state=all', async () => {
    const fx = await seedOrg()
    const repoId = await insertRepo(fx.orgId)
    await insertIssue(fx.orgId, repoId, { ghId: 1, number: 1, state: 'open' })
    await insertIssue(fx.orgId, repoId, { ghId: 2, number: 2, state: 'closed' })

    const dflt = await readService.listIssues({ organisationId: fx.orgId, repoId })
    expect(dflt!.total).toBe(1)
    expect(dflt!.rows[0]!.state).toBe('open')

    const all = await readService.listIssues({
      organisationId: fx.orgId,
      repoId,
      filter: { state: 'all' },
    })
    expect(all!.total).toBe(2)
  })

  it('filters by labels (any-of) and q (title LIKE)', async () => {
    const fx = await seedOrg()
    const repoId = await insertRepo(fx.orgId)
    await insertIssue(fx.orgId, repoId, { ghId: 1, number: 1, title: 'API bug', labels: ['bug', 'api'] })
    await insertIssue(fx.orgId, repoId, { ghId: 2, number: 2, title: 'docs', labels: ['docs'] })
    await insertIssue(fx.orgId, repoId, { ghId: 3, number: 3, title: 'enhance API', labels: ['enhancement'] })

    const byLabel = await readService.listIssues({
      organisationId: fx.orgId,
      repoId,
      filter: { labels: ['bug', 'enhancement'] },
    })
    expect(byLabel!.total).toBe(2)

    const byQ = await readService.listIssues({
      organisationId: fx.orgId,
      repoId,
      filter: { q: 'api' },
    })
    expect(byQ!.total).toBe(2)
  })

  it('paginates with accurate total', async () => {
    const fx = await seedOrg()
    const repoId = await insertRepo(fx.orgId)
    for (let i = 0; i < 4; i += 1) {
      await insertIssue(fx.orgId, repoId, {
        ghId: i + 1,
        number: i + 1,
        title: `Issue ${i}`,
        ghCreatedAt: new Date(Date.UTC(2024, 0, i + 1)),
      })
    }
    const page = await readService.listIssues({
      organisationId: fx.orgId,
      repoId,
      pagination: { limit: 2, offset: 0 },
    })
    expect(page!.total).toBe(4)
    expect(page!.rows).toHaveLength(2)
    // Default sort: createdAt:desc — newest first.
    expect(page!.rows[0]!.title).toBe('Issue 3')
  })
})

// ─── Read service: pulls ────────────────────────────────────────────────────

describe('ghProjectsReadService.listPulls', () => {
  it('filters by state including merged', async () => {
    const fx = await seedOrg()
    const repoId = await insertRepo(fx.orgId)
    await insertPull(fx.orgId, repoId, { ghId: 1, number: 1, state: 'open' })
    await insertPull(fx.orgId, repoId, { ghId: 2, number: 2, state: 'merged', ghMergedAt: new Date() })
    await insertPull(fx.orgId, repoId, { ghId: 3, number: 3, state: 'closed' })

    const merged = await readService.listPulls({
      organisationId: fx.orgId,
      repoId,
      filter: { state: 'merged' },
    })
    expect(merged!.total).toBe(1)

    const all = await readService.listPulls({
      organisationId: fx.orgId,
      repoId,
      filter: { state: 'all' },
    })
    expect(all!.total).toBe(3)

    const dflt = await readService.listPulls({ organisationId: fx.orgId, repoId })
    expect(dflt!.total).toBe(1)
    expect(dflt!.rows[0]!.state).toBe('open')
  })

  it('cross-org repoId returns null', async () => {
    const a = await seedOrg()
    const b = await seedOrg()
    const bRepo = await insertRepo(b.orgId)
    expect(await readService.listPulls({ organisationId: a.orgId, repoId: bRepo })).toBeNull()
  })
})

// ─── Read service: commits ──────────────────────────────────────────────────

describe('ghProjectsReadService.listCommits', () => {
  it('filters by since (>=) and author (login exact / name LIKE)', async () => {
    const fx = await seedOrg()
    const repoId = await insertRepo(fx.orgId)
    await insertCommit(fx.orgId, repoId, {
      sha: 'a'.repeat(40),
      authorLogin: 'alice',
      authorName: 'Alice',
      authoredAt: new Date('2024-01-01T00:00:00Z'),
    })
    await insertCommit(fx.orgId, repoId, {
      sha: 'b'.repeat(40),
      authorLogin: 'bob',
      authorName: 'Bob',
      authoredAt: new Date('2024-06-01T00:00:00Z'),
    })

    const since = await readService.listCommits({
      organisationId: fx.orgId,
      repoId,
      filter: { since: new Date('2024-03-01T00:00:00Z') },
    })
    expect(since!.total).toBe(1)
    expect(since!.rows[0]!.authorLogin).toBe('bob')

    const byAuthor = await readService.listCommits({
      organisationId: fx.orgId,
      repoId,
      filter: { author: 'alice' },
    })
    expect(byAuthor!.total).toBe(1)
    expect(byAuthor!.rows[0]!.authorLogin).toBe('alice')
  })

  it('cross-org repoId returns null', async () => {
    const a = await seedOrg()
    const b = await seedOrg()
    const bRepo = await insertRepo(b.orgId)
    expect(await readService.listCommits({ organisationId: a.orgId, repoId: bRepo })).toBeNull()
  })
})

// ─── Sync service hookup (per-repo sync, purge) ─────────────────────────────
//
// These exercise the same surface the route handlers call without the HTTP
// layer. Mocks the upstream `ghClientService` so no network calls happen.

describe('ghSyncService — manual per-repo sync via repoId', () => {
  it('syncs a repo by id and updates last_synced_at', async () => {
    const fx = await seedOrg()
    const repoId = await insertRepo(fx.orgId, {
      ghId: 1,
      owner: 'octocat',
      name: 'hello',
      fullName: 'octocat/hello',
    })

    const ghClientStub: Pick<
      GhClientService,
      'listAccessibleRepos' | 'getRepo' | 'listIssues' | 'listPulls' | 'listCommits'
    > = {
      listAccessibleRepos: vi.fn(),
      getRepo: vi.fn().mockResolvedValue({
        ghId: 1,
        owner: 'octocat',
        name: 'hello',
        fullName: 'octocat/hello',
        description: null,
        private: true,
        defaultBranch: 'main',
        htmlUrl: 'https://github.com/octocat/hello',
        ghCreatedAt: null,
        ghUpdatedAt: null,
      }),
      listIssues: vi.fn().mockResolvedValue([]),
      listPulls: vi.fn().mockResolvedValue([]),
      listCommits: vi.fn().mockResolvedValue([]),
    }
    const ghConnectionsStub = {
      getConnectionContext: vi.fn(),
    } as unknown as Pick<GhConnectionsService, 'getConnectionContext'>

    const syncService = createGhSyncService({
      db,
      ghClientService: ghClientStub,
      ghConnectionsService: ghConnectionsStub,
    })

    const result = await syncService.syncRepo({ organisationId: fx.orgId, repoId })
    expect(result.repo.id).toBe(repoId)
    expect(result.repo.lastSyncedAt).toBeInstanceOf(Date)
    expect(result.counts).toEqual({ issues: 0, pulls: 0, commits: 0 })
  })

  it('purgeRepo soft-deletes repo and hard-deletes children', async () => {
    const fx = await seedOrg()
    const repoId = await insertRepo(fx.orgId)
    await insertIssue(fx.orgId, repoId)
    await insertPull(fx.orgId, repoId)
    await insertCommit(fx.orgId, repoId)

    const syncService = createGhSyncService({
      db,
      ghClientService: {
        listAccessibleRepos: vi.fn(),
        getRepo: vi.fn(),
        listIssues: vi.fn(),
        listPulls: vi.fn(),
        listCommits: vi.fn(),
      },
      ghConnectionsService: { getConnectionContext: vi.fn() } as unknown as Pick<GhConnectionsService, 'getConnectionContext'>,
    })

    await syncService.purgeRepo({ organisationId: fx.orgId, repoId })

    const repos = await db.select().from(schema.ghRepos)
    expect(repos[0]!.deletedAt).toBeInstanceOf(Date)
    expect(repos[0]!.tracked).toBe(false)

    expect(await db.select().from(schema.ghIssues)).toHaveLength(0)
    expect(await db.select().from(schema.ghPulls)).toHaveLength(0)
    expect(await db.select().from(schema.ghCommits)).toHaveLength(0)
  })
})

// ─── RBAC seed assertions (permission gating contract) ──────────────────────

describe('rbac seed — projects permission gating', () => {
  const findRole = (name: string) => DEFAULT_ROLES.find(r => r.name === name && r.scope === 'organisation')

  it('owner grants project:read AND project:manage', () => {
    const role = findRole('Owner')
    expect(role).toBeDefined()
    expect(role!.permissions).toContain(PERMISSIONS.PROJECT_READ)
    expect(role!.permissions).toContain(PERMISSIONS.PROJECT_MANAGE)
  })

  it('admin grants project:read AND project:manage', () => {
    const role = findRole('Admin')
    expect(role).toBeDefined()
    expect(role!.permissions).toContain(PERMISSIONS.PROJECT_READ)
    expect(role!.permissions).toContain(PERMISSIONS.PROJECT_MANAGE)
  })

  it('member grants project:read but NOT project:manage', () => {
    const role = findRole('Member')
    expect(role).toBeDefined()
    expect(role!.permissions).toContain(PERMISSIONS.PROJECT_READ)
    expect(role!.permissions).not.toContain(PERMISSIONS.PROJECT_MANAGE)
  })
})
