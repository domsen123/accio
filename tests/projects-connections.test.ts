import type { OctokitFactory, OctokitLike } from '../server/features/projects/connections.service'
import { eq, sql } from 'drizzle-orm'
import { ulid } from 'ulid'

import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as schema from '../server/database/schema'
import {
  createGhConnectionsService,

} from '../server/features/projects/connections.service'
import {
  GhTokenInsufficientScopeError,
  GhTokenInvalidError,
} from '../server/features/projects/errors'
import { getDatabase } from '../server/infrastructure/database/client'
import { decryptForOrg } from '../server/utils/crypto'

import { createOrganisationData } from './factories'

// ─── Octokit mock ───────────────────────────────────────────────────────────
//
// We dependency-inject a mock factory so we don't need to touch
// `@octokit/rest` at all in the test. The factory records the token it was
// called with and returns a stub that resolves with the configured response.
// Each test installs its own response shape.
//
// We still use `vi.hoisted` for symmetry with `tests/ai-provider.test.ts` —
// the hoisted block gives us mock identities that survive
// reset-between-tests via `mockClear` / `mockReset`.

const mocks = vi.hoisted(() => {
  const getAuthenticated = vi.fn<() => Promise<{
    status: number
    headers: Record<string, string | undefined>
    data: { id: number, login: string }
  }>>()
  return { getAuthenticated }
})

const { getAuthenticated } = mocks

const buildOctokitFactory = (): OctokitFactory & { lastToken: string | null, callCount: number } => {
  const fn = ((token: string) => {
    fn.lastToken = token
    fn.callCount += 1
    const stub: OctokitLike = {
      rest: {
        users: {
          getAuthenticated,
        },
      },
    }
    return stub
  }) as OctokitFactory & { lastToken: string | null, callCount: number }
  fn.lastToken = null
  fn.callCount = 0
  return fn
}

const db = getDatabase('app')

// Projects tables aren't in the global afterEach TRUNCATE; clean explicitly.
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
  cryptoSalt: string
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
  return { orgId, cryptoSalt: orgData.cryptoSalt }
}

const insertRepoRow = async (orgId: string, connectionId: string | null): Promise<string> => {
  const id = ulid()
  await db.insert(schema.ghRepos).values({
    id,
    organisationId: orgId,
    connectionId,
    ghId: Math.floor(Math.random() * 1_000_000),
    owner: 'octocat',
    name: `repo-${id.slice(-6)}`,
    fullName: `octocat/repo-${id.slice(-6)}`,
    private: true,
    tracked: true,
  })
  return id
}

const goodResponse = (overrides: Partial<{ login: string, id: number, scopes: string }> = {}) => ({
  status: 200 as const,
  headers: {
    'x-oauth-scopes': overrides.scopes ?? 'repo, read:user',
  } as Record<string, string | undefined>,
  data: {
    login: overrides.login ?? 'octocat',
    id: overrides.id ?? 5_834_421,
  },
})

describe('ghConnectionsService.connect', () => {
  let fx: OrgFixture
  let octokitFactory: ReturnType<typeof buildOctokitFactory>
  let service: ReturnType<typeof createGhConnectionsService>

  beforeEach(async () => {
    await cleanProjectsTables()
    getAuthenticated.mockReset()
    octokitFactory = buildOctokitFactory()
    service = createGhConnectionsService({ db, octokitFactory })
    fx = await seedOrg()
  })

  it('encrypts the token, populates identity + scopes, and sets lastValidatedAt', async () => {
    getAuthenticated.mockResolvedValueOnce(goodResponse({ login: 'alice', id: 42, scopes: 'repo, read:user' }))

    const result = await service.connect({ organisationId: fx.orgId, token: 'ghp_real-secret-1234567890' })

    expect(result).toEqual({
      connected: true,
      ghUserLogin: 'alice',
      ghUserId: 42,
      scopes: ['repo', 'read:user'],
    })
    expect(octokitFactory.lastToken).toBe('ghp_real-secret-1234567890')

    const rows = await db
      .select()
      .from(schema.ghConnections)
      .where(eq(schema.ghConnections.organisationId, fx.orgId))
    expect(rows).toHaveLength(1)
    const row = rows[0]!
    expect(row.ghUserLogin).toBe('alice')
    expect(row.ghUserId).toBe(42)
    expect(row.scopes).toEqual(['repo', 'read:user'])
    expect(row.lastValidatedAt).toBeInstanceOf(Date)

    // Stored blob must NOT be the plaintext.
    expect(row.tokenEncrypted).not.toBe('ghp_real-secret-1234567890')
    expect(row.tokenEncrypted).not.toContain('ghp_real-secret-1234567890')
    // And it must round-trip through decryptForOrg.
    expect(decryptForOrg(row.tokenEncrypted, fx.cryptoSalt)).toBe('ghp_real-secret-1234567890')
  })

  it('upserts: a second connect updates the existing row in place', async () => {
    getAuthenticated.mockResolvedValueOnce(goodResponse({ login: 'alice', id: 1, scopes: 'repo' }))
    await service.connect({ organisationId: fx.orgId, token: 'token-one' })

    getAuthenticated.mockResolvedValueOnce(goodResponse({ login: 'alice-renamed', id: 1, scopes: 'repo, read:org' }))
    await service.connect({ organisationId: fx.orgId, token: 'token-two' })

    const rows = await db
      .select()
      .from(schema.ghConnections)
      .where(eq(schema.ghConnections.organisationId, fx.orgId))
    expect(rows).toHaveLength(1)
    const row = rows[0]!
    expect(row.ghUserLogin).toBe('alice-renamed')
    expect(row.scopes).toEqual(['repo', 'read:org'])
    expect(decryptForOrg(row.tokenEncrypted, fx.cryptoSalt)).toBe('token-two')
  })

  it('throws GhTokenInvalidError on a 401 from GitHub and writes nothing', async () => {
    const httpError = Object.assign(new Error('Bad credentials'), { status: 401 })
    getAuthenticated.mockRejectedValueOnce(httpError)

    await expect(
      service.connect({ organisationId: fx.orgId, token: 'bad-token' }),
    ).rejects.toBeInstanceOf(GhTokenInvalidError)

    const rows = await db
      .select()
      .from(schema.ghConnections)
      .where(eq(schema.ghConnections.organisationId, fx.orgId))
    expect(rows).toHaveLength(0)
  })

  it('leaves an existing row untouched when a fresh connect attempt fails with 401', async () => {
    getAuthenticated.mockResolvedValueOnce(goodResponse({ login: 'alice', id: 1, scopes: 'repo' }))
    await service.connect({ organisationId: fx.orgId, token: 'good-token' })

    const before = await db
      .select()
      .from(schema.ghConnections)
      .where(eq(schema.ghConnections.organisationId, fx.orgId))
    const beforeRow = before[0]!

    const httpError = Object.assign(new Error('Bad credentials'), { status: 401 })
    getAuthenticated.mockRejectedValueOnce(httpError)

    await expect(
      service.connect({ organisationId: fx.orgId, token: 'wrong-token' }),
    ).rejects.toBeInstanceOf(GhTokenInvalidError)

    const after = await db
      .select()
      .from(schema.ghConnections)
      .where(eq(schema.ghConnections.organisationId, fx.orgId))
    expect(after).toHaveLength(1)
    expect(after[0]!.tokenEncrypted).toBe(beforeRow.tokenEncrypted)
    expect(after[0]!.ghUserLogin).toBe(beforeRow.ghUserLogin)
  })

  it('throws GhTokenInsufficientScopeError when a classic PAT lacks repo scope', async () => {
    // Header present (classic PAT) but no `repo` scope → reject.
    getAuthenticated.mockResolvedValueOnce({
      status: 200,
      headers: { 'x-oauth-scopes': 'read:user' },
      data: { id: 1, login: 'alice' },
    })

    await expect(
      service.connect({ organisationId: fx.orgId, token: 'tok' }),
    ).rejects.toBeInstanceOf(GhTokenInsufficientScopeError)

    const rows = await db
      .select()
      .from(schema.ghConnections)
      .where(eq(schema.ghConnections.organisationId, fx.orgId))
    expect(rows).toHaveLength(0)
  })

  it('accepts a fine-grained PAT (no x-oauth-scopes header) without scope check', async () => {
    // Fine-grained PATs report no scopes header; service must accept and
    // record an empty scopes list.
    getAuthenticated.mockResolvedValueOnce({
      status: 200,
      headers: {},
      data: { id: 99, login: 'fg-user' },
    })

    const result = await service.connect({ organisationId: fx.orgId, token: 'github_pat_fg' })
    expect(result.scopes).toEqual([])
    expect(result.ghUserLogin).toBe('fg-user')

    const rows = await db
      .select()
      .from(schema.ghConnections)
      .where(eq(schema.ghConnections.organisationId, fx.orgId))
    expect(rows[0]!.scopes).toEqual([])
  })
})

describe('ghConnectionsService.getStatus', () => {
  let fx: OrgFixture
  let octokitFactory: ReturnType<typeof buildOctokitFactory>
  let service: ReturnType<typeof createGhConnectionsService>

  beforeEach(async () => {
    await cleanProjectsTables()
    getAuthenticated.mockReset()
    octokitFactory = buildOctokitFactory()
    service = createGhConnectionsService({ db, octokitFactory })
    fx = await seedOrg()
  })

  it('returns connected: false when no row exists', async () => {
    const status = await service.getStatus({ organisationId: fx.orgId })
    expect(status).toEqual({ connected: false })
  })

  it('returns connected: true with login + scopes after a connect', async () => {
    getAuthenticated.mockResolvedValueOnce(goodResponse({ login: 'alice', id: 5, scopes: 'repo, workflow' }))
    await service.connect({ organisationId: fx.orgId, token: 'tok' })

    const status = await service.getStatus({ organisationId: fx.orgId })
    expect(status.connected).toBe(true)
    expect(status.ghUserLogin).toBe('alice')
    expect(status.ghUserId).toBe(5)
    expect(status.scopes).toEqual(['repo', 'workflow'])
    expect(status.lastValidatedAt).toBeInstanceOf(Date)
  })
})

describe('ghConnectionsService.revoke', () => {
  let fx: OrgFixture
  let octokitFactory: ReturnType<typeof buildOctokitFactory>
  let service: ReturnType<typeof createGhConnectionsService>

  beforeEach(async () => {
    await cleanProjectsTables()
    getAuthenticated.mockReset()
    octokitFactory = buildOctokitFactory()
    service = createGhConnectionsService({ db, octokitFactory })
    fx = await seedOrg()
  })

  it('with purgeData=false (default), drops the connection but retains gh_repos rows (REQ-PROJ-1)', async () => {
    getAuthenticated.mockResolvedValueOnce(goodResponse())
    await service.connect({ organisationId: fx.orgId, token: 'tok' })

    const connectionRow = (await db
      .select()
      .from(schema.ghConnections)
      .where(eq(schema.ghConnections.organisationId, fx.orgId)))[0]!

    const repoId = await insertRepoRow(fx.orgId, connectionRow.id)

    await service.revoke({ organisationId: fx.orgId })

    const connections = await db
      .select()
      .from(schema.ghConnections)
      .where(eq(schema.ghConnections.organisationId, fx.orgId))
    expect(connections).toHaveLength(0)

    const repos = await db
      .select()
      .from(schema.ghRepos)
      .where(eq(schema.ghRepos.id, repoId))
    expect(repos).toHaveLength(1)
    // FK was ON DELETE SET NULL — connection_id is now null, repo cache survives.
    expect(repos[0]!.connectionId).toBeNull()
  })

  it('with purgeData=true, hard-deletes all gh_* cache rows for the workspace', async () => {
    getAuthenticated.mockResolvedValueOnce(goodResponse())
    await service.connect({ organisationId: fx.orgId, token: 'tok' })

    const connectionRow = (await db
      .select()
      .from(schema.ghConnections)
      .where(eq(schema.ghConnections.organisationId, fx.orgId)))[0]!

    const repoId = await insertRepoRow(fx.orgId, connectionRow.id)

    // One issue, one PR, one commit attached to the repo.
    await db.insert(schema.ghIssues).values({
      id: ulid(),
      organisationId: fx.orgId,
      repoId,
      ghId: 12345,
      number: 1,
      title: 'Hello',
      state: 'open',
      author: { login: 'alice', id: 1 },
      htmlUrl: 'https://github.com/octocat/x/issues/1',
    })
    await db.insert(schema.ghPulls).values({
      id: ulid(),
      organisationId: fx.orgId,
      repoId,
      ghId: 67890,
      number: 2,
      title: 'PR',
      state: 'open',
      author: { login: 'alice', id: 1 },
      headRef: 'feature',
      baseRef: 'main',
      htmlUrl: 'https://github.com/octocat/x/pull/2',
    })
    await db.insert(schema.ghCommits).values({
      id: ulid(),
      organisationId: fx.orgId,
      repoId,
      sha: 'deadbeef',
      message: 'init',
      htmlUrl: 'https://github.com/octocat/x/commit/deadbeef',
    })

    await service.revoke({ organisationId: fx.orgId, purgeData: true })

    const remaining = await Promise.all([
      db.select().from(schema.ghConnections).where(eq(schema.ghConnections.organisationId, fx.orgId)),
      db.select().from(schema.ghRepos).where(eq(schema.ghRepos.organisationId, fx.orgId)),
      db.select().from(schema.ghIssues).where(eq(schema.ghIssues.organisationId, fx.orgId)),
      db.select().from(schema.ghPulls).where(eq(schema.ghPulls.organisationId, fx.orgId)),
      db.select().from(schema.ghCommits).where(eq(schema.ghCommits.organisationId, fx.orgId)),
    ])
    expect(remaining.every(rows => rows.length === 0)).toBe(true)
  })

  it('is workspace-isolated: revoking org A leaves org B intact', async () => {
    const fxB = await seedOrg()

    getAuthenticated.mockResolvedValueOnce(goodResponse({ login: 'a', id: 1 }))
    await service.connect({ organisationId: fx.orgId, token: 'tok-a' })

    getAuthenticated.mockResolvedValueOnce(goodResponse({ login: 'b', id: 2 }))
    await service.connect({ organisationId: fxB.orgId, token: 'tok-b' })

    await service.revoke({ organisationId: fx.orgId })

    const a = await service.getStatus({ organisationId: fx.orgId })
    const b = await service.getStatus({ organisationId: fxB.orgId })
    expect(a.connected).toBe(false)
    expect(b.connected).toBe(true)
    expect(b.ghUserLogin).toBe('b')
  })
})

describe('ghConnectionsService.validate', () => {
  let fx: OrgFixture
  let octokitFactory: ReturnType<typeof buildOctokitFactory>
  let service: ReturnType<typeof createGhConnectionsService>

  beforeEach(async () => {
    await cleanProjectsTables()
    getAuthenticated.mockReset()
    octokitFactory = buildOctokitFactory()
    service = createGhConnectionsService({ db, octokitFactory })
    fx = await seedOrg()
  })

  it('returns valid:true after a successful re-validation and bumps lastValidatedAt', async () => {
    getAuthenticated.mockResolvedValueOnce(goodResponse({ login: 'alice', id: 1, scopes: 'repo' }))
    await service.connect({ organisationId: fx.orgId, token: 'tok' })

    const before = (await db
      .select()
      .from(schema.ghConnections)
      .where(eq(schema.ghConnections.organisationId, fx.orgId)))[0]!

    // Wait a tick so timestamps differ.
    await new Promise(r => setTimeout(r, 10))

    getAuthenticated.mockResolvedValueOnce(goodResponse({ login: 'alice', id: 1, scopes: 'repo' }))
    const result = await service.validate({ organisationId: fx.orgId })

    expect(result).toEqual({
      valid: true,
      ghUserLogin: 'alice',
      ghUserId: 1,
      scopes: ['repo'],
    })

    // The decrypted token must have flowed through the factory (re-validate
    // hits GitHub with the stored PAT).
    expect(octokitFactory.lastToken).toBe('tok')

    const after = (await db
      .select()
      .from(schema.ghConnections)
      .where(eq(schema.ghConnections.organisationId, fx.orgId)))[0]!
    expect(after.lastValidatedAt).toBeInstanceOf(Date)
    expect(after.lastValidatedAt!.getTime()).toBeGreaterThan(before.lastValidatedAt!.getTime())
  })

  it('returns reason:no_connection when there is no row', async () => {
    const result = await service.validate({ organisationId: fx.orgId })
    expect(result).toEqual({ valid: false, reason: 'no_connection' })
  })

  it('returns reason:invalid_token on a 401 from GitHub and updates nothing', async () => {
    getAuthenticated.mockResolvedValueOnce(goodResponse())
    await service.connect({ organisationId: fx.orgId, token: 'tok' })

    const before = (await db
      .select()
      .from(schema.ghConnections)
      .where(eq(schema.ghConnections.organisationId, fx.orgId)))[0]!

    const httpError = Object.assign(new Error('Bad credentials'), { status: 401 })
    getAuthenticated.mockRejectedValueOnce(httpError)

    const result = await service.validate({ organisationId: fx.orgId })
    expect(result).toEqual({ valid: false, reason: 'invalid_token' })

    const after = (await db
      .select()
      .from(schema.ghConnections)
      .where(eq(schema.ghConnections.organisationId, fx.orgId)))[0]!
    // last_validated_at unchanged
    expect(after.lastValidatedAt!.getTime()).toBe(before.lastValidatedAt!.getTime())
    expect(after.tokenEncrypted).toBe(before.tokenEncrypted)
  })
})
