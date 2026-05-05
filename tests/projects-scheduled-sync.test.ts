import type { SyncAllTrackedArgs, SyncAllTrackedResult } from '../server/features/projects/sync.service'
import { sql } from 'drizzle-orm'
import { ulid } from 'ulid'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import * as schema from '../server/database/schema'
import { runScheduledSync } from '../server/features/projects/scheduled-sync'
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

const seedOrg = async () => {
  const orgData = createOrganisationData()
  const orgId = ulid()
  await db.insert(schema.organisations).values({
    id: orgId,
    name: orgData.name,
    slug: `${orgData.slug}-${orgId.slice(-6).toLowerCase()}`,
    cryptoSalt: orgData.cryptoSalt,
  })
  return orgId
}

const seedRepo = async (orgId: string, opts: { tracked: boolean, deleted?: boolean, ghId: number, name: string }) => {
  const id = ulid()
  await db.insert(schema.ghRepos).values({
    id,
    organisationId: orgId,
    connectionId: null,
    ghId: opts.ghId,
    owner: 'octocat',
    name: opts.name,
    fullName: `octocat/${opts.name}`,
    defaultBranch: 'main',
    private: false,
    description: null,
    tracked: opts.tracked,
    deletedAt: opts.deleted ? new Date() : null,
  })
  return id
}

const makeStub = (impl: (args: SyncAllTrackedArgs) => Promise<SyncAllTrackedResult>) => ({
  syncAllTracked: vi.fn(impl),
})

const okResult = (n: number): SyncAllTrackedResult => ({
  repoResults: Array.from({ length: n }, (_, i) => ({ repoId: `repo-${i}`, ok: true as const, counts: { issues: 0, pulls: 0, commits: 0 } })),
})

const mixedResult = (okCount: number, failCount: number): SyncAllTrackedResult => ({
  repoResults: [
    ...Array.from({ length: okCount }, (_, i) => ({ repoId: `ok-${i}`, ok: true as const, counts: { issues: 1, pulls: 1, commits: 1 } })),
    ...Array.from({ length: failCount }, (_, i) => ({ repoId: `err-${i}`, ok: false as const, error: 'rate-limited' })),
  ],
})

describe('runScheduledSync (T-4.5)', () => {
  beforeEach(async () => {
    await cleanProjectsTables()
  })

  it('discovers orgs with tracked repos and calls syncAllTracked once per org', async () => {
    const orgA = await seedOrg()
    const orgB = await seedOrg()
    await seedRepo(orgA, { tracked: true, ghId: 1, name: 'a1' })
    await seedRepo(orgA, { tracked: true, ghId: 2, name: 'a2' })
    await seedRepo(orgB, { tracked: true, ghId: 3, name: 'b1' })

    const stub = makeStub(async args => okResult(args.organisationId === orgA ? 2 : 1))
    const result = await runScheduledSync({ db, ghSyncService: stub })

    expect(stub.syncAllTracked).toHaveBeenCalledTimes(2)
    const calledOrgs = stub.syncAllTracked.mock.calls.map(c => c[0].organisationId).sort()
    expect(calledOrgs).toEqual([orgA, orgB].sort())
    expect(result.organisations).toHaveLength(2)
    expect(result.organisations.every(o => o.ok)).toBe(true)
    const aSummary = result.organisations.find(o => o.organisationId === orgA)
    expect(aSummary && aSummary.ok && aSummary.reposSynced).toBe(2)
  })

  it('skips orgs with no tracked repos (untracked + soft-deleted excluded)', async () => {
    const orgA = await seedOrg()
    const orgB = await seedOrg()
    const orgC = await seedOrg()
    // orgA has only an untracked repo
    await seedRepo(orgA, { tracked: false, ghId: 10, name: 'untracked' })
    // orgB has only a soft-deleted tracked repo
    await seedRepo(orgB, { tracked: true, deleted: true, ghId: 20, name: 'gone' })
    // orgC has a healthy tracked repo
    await seedRepo(orgC, { tracked: true, ghId: 30, name: 'live' })

    const stub = makeStub(async () => okResult(1))
    const result = await runScheduledSync({ db, ghSyncService: stub })

    expect(stub.syncAllTracked).toHaveBeenCalledTimes(1)
    expect(stub.syncAllTracked.mock.calls[0]?.[0].organisationId).toBe(orgC)
    expect(result.organisations).toHaveLength(1)
    expect(result.organisations[0]?.organisationId).toBe(orgC)
  })

  it('returns no orgs when nothing is tracked anywhere', async () => {
    const orgA = await seedOrg()
    await seedRepo(orgA, { tracked: false, ghId: 1, name: 'x' })

    const stub = makeStub(async () => okResult(0))
    const result = await runScheduledSync({ db, ghSyncService: stub })

    expect(stub.syncAllTracked).not.toHaveBeenCalled()
    expect(result.organisations).toEqual([])
  })

  it('per-org failure does not abort the whole tick', async () => {
    const orgA = await seedOrg()
    const orgB = await seedOrg()
    await seedRepo(orgA, { tracked: true, ghId: 1, name: 'a' })
    await seedRepo(orgB, { tracked: true, ghId: 2, name: 'b' })

    const stub = makeStub(async (args) => {
      if (args.organisationId === orgA)
        throw new Error('boom-A')
      return okResult(1)
    })
    const result = await runScheduledSync({ db, ghSyncService: stub })

    expect(stub.syncAllTracked).toHaveBeenCalledTimes(2)
    expect(result.organisations).toHaveLength(2)
    const a = result.organisations.find(o => o.organisationId === orgA)
    const b = result.organisations.find(o => o.organisationId === orgB)
    expect(a && a.ok === false ? a.error : null).toBe('boom-A')
    expect(b && b.ok === true ? b.reposSynced : null).toBe(1)
  })

  it('records per-org repo summary including partial failures', async () => {
    const orgA = await seedOrg()
    await seedRepo(orgA, { tracked: true, ghId: 1, name: 'a' })

    const stub = makeStub(async () => mixedResult(2, 3))
    const result = await runScheduledSync({ db, ghSyncService: stub })

    const summary = result.organisations[0]
    expect(summary && summary.ok).toBe(true)
    if (summary && summary.ok) {
      expect(summary.reposSynced).toBe(2)
      expect(summary.reposFailed).toBe(3)
    }
  })

  it('passes a logger and emits info per org', async () => {
    const orgA = await seedOrg()
    await seedRepo(orgA, { tracked: true, ghId: 1, name: 'a' })

    const logger = { info: vi.fn(), error: vi.fn() }
    const stub = makeStub(async () => okResult(1))
    await runScheduledSync({ db, ghSyncService: stub, logger })

    expect(logger.info).toHaveBeenCalled()
    expect(logger.error).not.toHaveBeenCalled()
  })

  it('logs error per failing org via logger.error', async () => {
    const orgA = await seedOrg()
    await seedRepo(orgA, { tracked: true, ghId: 1, name: 'a' })

    const logger = { info: vi.fn(), error: vi.fn() }
    const stub = makeStub(async () => {
      throw new Error('upstream-down')
    })
    await runScheduledSync({ db, ghSyncService: stub, logger })

    expect(logger.error).toHaveBeenCalledTimes(1)
    const [, data] = logger.error.mock.calls[0] ?? []
    expect((data as { error: string }).error).toBe('upstream-down')
  })
})
