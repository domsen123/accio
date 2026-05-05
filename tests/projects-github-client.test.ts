import type {
  GhClientService,
  GhCommitApi,
  GhIssueApi,
  GhPullApi,
  GhRepoApi,
  OctokitFactory,
  OctokitLike,
} from '../server/features/projects/github-client'
import { sql } from 'drizzle-orm'
import { ulid } from 'ulid'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import * as schema from '../server/database/schema'
import { createGhConnectionsService } from '../server/features/projects/connections.service'
import {
  GhClientNotConnectedError,
  GhRateLimitedError,
  GhResourceNotFoundError,
  GhTokenInvalidError,
} from '../server/features/projects/errors'
import { createGhClientService } from '../server/features/projects/github-client'
import { getDatabase } from '../server/infrastructure/database/client'
import { encryptForOrg } from '../server/utils/crypto'
import { createOrganisationData } from './factories'

// ─── Octokit mocks ──────────────────────────────────────────────────────────
//
// Hoisted mock fns mirror the projects-connections.test.ts pattern. Each test
// installs its own response shape; the factory records the token so we can
// assert the wrapper resolves the correct PAT per call.

const mocks = vi.hoisted(() => {
  return {
    listForAuthenticatedUser: vi.fn(),
    reposGet: vi.fn(),
    listCommits: vi.fn(),
    issuesListForRepo: vi.fn(),
    pullsList: vi.fn(),
    // Connections-service stub for the inner getConnectionContext call
    getAuthenticated: vi.fn(),
  }
})

const buildOctokitFactory = (): OctokitFactory & { tokens: string[], callCount: number } => {
  const fn = ((token: string) => {
    fn.tokens.push(token)
    fn.callCount += 1
    const stub: OctokitLike = {
      rest: {
        repos: {
          listForAuthenticatedUser: mocks.listForAuthenticatedUser as OctokitLike['rest']['repos']['listForAuthenticatedUser'],
          get: mocks.reposGet as OctokitLike['rest']['repos']['get'],
          listCommits: mocks.listCommits as OctokitLike['rest']['repos']['listCommits'],
        },
        issues: {
          listForRepo: mocks.issuesListForRepo as OctokitLike['rest']['issues']['listForRepo'],
        },
        pulls: {
          list: mocks.pullsList as OctokitLike['rest']['pulls']['list'],
        },
      },
    }
    return stub
  }) as OctokitFactory & { tokens: string[], callCount: number }
  fn.tokens = []
  fn.callCount = 0
  return fn
}

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

const seedConnection = async (fx: OrgFixture, token = 'ghp_real-token') => {
  await db.insert(schema.ghConnections).values({
    id: ulid(),
    organisationId: fx.orgId,
    tokenEncrypted: encryptForOrg(token, fx.cryptoSalt),
    ghUserLogin: 'octocat',
    ghUserId: 1,
    scopes: ['repo'],
    lastValidatedAt: new Date(),
  })
}

// ─── Sample API payloads ────────────────────────────────────────────────────

const sampleRepo = (overrides: Partial<GhRepoApi> = {}): GhRepoApi => ({
  id: 12345,
  owner: { login: 'octocat' },
  name: 'hello',
  full_name: 'octocat/hello',
  description: 'a repo',
  private: true,
  default_branch: 'main',
  html_url: 'https://github.com/octocat/hello',
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-06-01T12:34:56Z',
  ...overrides,
})

const sampleIssue = (overrides: Partial<GhIssueApi> = {}): GhIssueApi => ({
  id: 1001,
  number: 1,
  title: 'Bug',
  body: 'broken',
  state: 'open',
  state_reason: null,
  labels: [{ name: 'bug' }, 'help wanted'],
  assignees: [{ login: 'alice', id: 5, avatar_url: 'a.png' }],
  user: { login: 'reporter', id: 9, avatar_url: 'r.png' },
  comments: 3,
  created_at: '2024-02-01T00:00:00Z',
  updated_at: '2024-02-02T00:00:00Z',
  closed_at: null,
  html_url: 'https://github.com/octocat/hello/issues/1',
  ...overrides,
})

const samplePull = (overrides: Partial<GhPullApi> = {}): GhPullApi => ({
  id: 2001,
  number: 5,
  title: 'Feature',
  body: 'adds X',
  state: 'open',
  draft: false,
  base: { ref: 'main' },
  head: { ref: 'feature' },
  labels: [{ name: 'enhancement' }],
  assignees: [{ login: 'bob' }],
  requested_reviewers: [{ login: 'carol' }],
  user: { login: 'submitter' },
  comments: 0,
  created_at: '2024-03-01T00:00:00Z',
  updated_at: '2024-03-02T00:00:00Z',
  closed_at: null,
  merged_at: null,
  html_url: 'https://github.com/octocat/hello/pull/5',
  ...overrides,
})

const sampleCommit = (overrides: Partial<GhCommitApi> = {}): GhCommitApi => ({
  sha: 'a'.repeat(40),
  commit: {
    message: 'init',
    author: { name: 'Alice', email: 'a@x.com', date: '2024-04-01T00:00:00Z' },
    committer: { name: 'Alice', email: 'a@x.com', date: '2024-04-01T00:00:00Z' },
  },
  author: { login: 'alice', avatar_url: 'a.png' },
  committer: { login: 'alice' },
  html_url: 'https://github.com/octocat/hello/commit/aaa',
  parents: [{ sha: 'b'.repeat(40) }],
  ...overrides,
})

const okResponse = <T>(data: T, headers: Record<string, string | undefined> = {}) => ({
  status: 200 as const,
  headers,
  data,
})

// ─── Test setup ─────────────────────────────────────────────────────────────

let factory: ReturnType<typeof buildOctokitFactory>
let connectionsService: ReturnType<typeof createGhConnectionsService>
let service: GhClientService
let fx: OrgFixture

beforeEach(async () => {
  await cleanProjectsTables()
  Object.values(mocks).forEach(m => m.mockReset())
  factory = buildOctokitFactory()
  connectionsService = createGhConnectionsService({ db, octokitFactory: () => ({ rest: { users: { getAuthenticated: mocks.getAuthenticated as never } } }) })
  service = createGhClientService({ db, ghConnectionsService: connectionsService, octokitFactory: factory })
  fx = await seedOrg()
})

// ─── getClient ──────────────────────────────────────────────────────────────

describe('ghClientService.getClient', () => {
  it('returns an Octokit instance bound to the decrypted PAT and the cached gh user login', async () => {
    await seedConnection(fx, 'ghp_secret-token')

    const result = await service.getClient(fx.orgId)

    expect(result.octokit).toBeDefined()
    expect(result.ghUserLogin).toBe('octocat')
    expect(factory.tokens).toEqual(['ghp_secret-token'])
    expect(factory.callCount).toBe(1)
  })

  it('throws GhClientNotConnectedError for orgs without a connection', async () => {
    await expect(service.getClient(fx.orgId)).rejects.toBeInstanceOf(GhClientNotConnectedError)
    expect(factory.callCount).toBe(0)
  })

  it('does not cache across calls (rotated PAT takes effect immediately)', async () => {
    await seedConnection(fx, 'token-one')
    await service.getClient(fx.orgId)

    // Simulate a token rotation by re-encrypting a new value.
    await db.execute(sql`DELETE FROM gh_connections WHERE organisation_id = ${fx.orgId}`)
    await seedConnection(fx, 'token-two')

    await service.getClient(fx.orgId)
    expect(factory.tokens).toEqual(['token-one', 'token-two'])
  })
})

// ─── listAccessibleRepos ────────────────────────────────────────────────────

describe('ghClientService.listAccessibleRepos', () => {
  it('normalises payloads and concatenates pages', async () => {
    await seedConnection(fx)

    // Build two pages that together exhaust the listing. perPage=100 is the
    // default; we use shorter mock arrays — the wrapper detects "page shorter
    // than per_page" and stops paginating.
    const pageOne = Array.from({ length: 100 }, (_, i) =>
      sampleRepo({ id: i + 1, name: `r${i + 1}`, full_name: `octocat/r${i + 1}` }))
    const pageTwo = [sampleRepo({ id: 9999, name: 'last', full_name: 'octocat/last' })]
    mocks.listForAuthenticatedUser.mockResolvedValueOnce(okResponse(pageOne))
    mocks.listForAuthenticatedUser.mockResolvedValueOnce(okResponse(pageTwo))

    const repos = await service.listAccessibleRepos(fx.orgId)

    expect(repos).toHaveLength(101)
    expect(repos[0]).toMatchObject({
      ghId: 1,
      owner: 'octocat',
      name: 'r1',
      fullName: 'octocat/r1',
      description: 'a repo',
      private: true,
      defaultBranch: 'main',
      htmlUrl: 'https://github.com/octocat/hello',
    })
    expect(repos[0]!.ghCreatedAt).toBeInstanceOf(Date)
    expect(repos[100]!.name).toBe('last')

    // The first call requested affiliation=owner,collaborator,organization_member.
    const firstCall = mocks.listForAuthenticatedUser.mock.calls[0]?.[0]
    expect(firstCall.affiliation).toBe('owner,collaborator,organization_member')
    expect(firstCall.page).toBe(1)
    expect(mocks.listForAuthenticatedUser.mock.calls[1]?.[0].page).toBe(2)
  })

  it('returns one page when `page` is specified', async () => {
    await seedConnection(fx)
    mocks.listForAuthenticatedUser.mockResolvedValueOnce(okResponse([sampleRepo()]))

    const repos = await service.listAccessibleRepos(fx.orgId, { page: 2 })
    expect(repos).toHaveLength(1)
    expect(mocks.listForAuthenticatedUser).toHaveBeenCalledTimes(1)
    expect(mocks.listForAuthenticatedUser.mock.calls[0]?.[0].page).toBe(2)
  })
})

// ─── listIssues ─────────────────────────────────────────────────────────────

describe('ghClientService.listIssues', () => {
  it('filters out PRs (issues whose payload has a `pull_request` field)', async () => {
    await seedConnection(fx)

    const realIssue = sampleIssue({ id: 1, number: 1, title: 'real issue' })
    const prMasqueradingAsIssue = sampleIssue({
      id: 2,
      number: 2,
      title: 'PR not issue',
      pull_request: { url: 'https://api.github.com/repos/octocat/hello/pulls/2' },
    })
    mocks.issuesListForRepo.mockResolvedValueOnce(okResponse([realIssue, prMasqueradingAsIssue]))

    const issues = await service.listIssues({ organisationId: fx.orgId, owner: 'octocat', name: 'hello' })

    expect(issues).toHaveLength(1)
    expect(issues[0]!.title).toBe('real issue')
    expect(issues[0]!.labels).toEqual(['bug', 'help wanted'])
    expect(issues[0]!.author.login).toBe('reporter')
    expect(mocks.issuesListForRepo.mock.calls[0]?.[0].state).toBe('open')
  })
})

// ─── listPulls ──────────────────────────────────────────────────────────────

describe('ghClientService.listPulls', () => {
  it('derives state="merged" when merged_at is non-null', async () => {
    await seedConnection(fx)

    const openPr = samplePull({ id: 1, number: 1, state: 'open', merged_at: null, closed_at: null })
    const closedPr = samplePull({ id: 2, number: 2, state: 'closed', merged_at: null, closed_at: '2024-03-10T00:00:00Z' })
    const mergedPr = samplePull({ id: 3, number: 3, state: 'closed', merged_at: '2024-03-09T12:00:00Z', closed_at: '2024-03-09T12:00:00Z' })
    mocks.pullsList.mockResolvedValueOnce(okResponse([openPr, closedPr, mergedPr]))

    const pulls = await service.listPulls({ organisationId: fx.orgId, owner: 'octocat', name: 'hello' })

    expect(pulls).toHaveLength(3)
    expect(pulls[0]!.state).toBe('open')
    expect(pulls[1]!.state).toBe('closed')
    expect(pulls[2]!.state).toBe('merged')
    expect(pulls[2]!.ghMergedAt).toBeInstanceOf(Date)

    // Diff stats omitted by the list endpoint — null in the snapshot.
    expect(pulls[0]!.additions).toBeNull()
    expect(pulls[0]!.deletions).toBeNull()
    expect(pulls[0]!.changedFiles).toBeNull()

    expect(pulls[0]!.requestedReviewers).toEqual([{ login: 'carol', id: undefined, avatarUrl: null }])
  })
})

// ─── listCommits ────────────────────────────────────────────────────────────

describe('ghClientService.listCommits', () => {
  it('honours the limit (defaults to 50)', async () => {
    await seedConnection(fx)

    const oneHundred = Array.from({ length: 100 }, (_, i) => sampleCommit({ sha: String(i).padStart(40, '0') }))
    mocks.listCommits.mockResolvedValueOnce(okResponse(oneHundred))

    const commits = await service.listCommits({ organisationId: fx.orgId, owner: 'octocat', name: 'hello' })

    expect(commits).toHaveLength(50)
    // The first call should have asked for per_page=50 (= min(100, 50)).
    expect(mocks.listCommits.mock.calls[0]?.[0].per_page).toBe(50)
    // Should NOT have made a second request — single page satisfies limit.
    expect(mocks.listCommits).toHaveBeenCalledTimes(1)
  })

  it('respects an explicit limit override', async () => {
    await seedConnection(fx)

    const twenty = Array.from({ length: 20 }, (_, i) => sampleCommit({ sha: String(i).padStart(40, '0') }))
    mocks.listCommits.mockResolvedValueOnce(okResponse(twenty))

    const commits = await service.listCommits({ organisationId: fx.orgId, owner: 'octocat', name: 'hello', limit: 10 })
    expect(commits).toHaveLength(10)
    expect(commits[0]!.parents).toEqual(['b'.repeat(40)])
  })
})

// ─── Error mapping ──────────────────────────────────────────────────────────

describe('ghClientService error mapping', () => {
  it('maps 401 to GhTokenInvalidError', async () => {
    await seedConnection(fx)
    mocks.listForAuthenticatedUser.mockRejectedValueOnce(Object.assign(new Error('Bad credentials'), { status: 401 }))

    await expect(service.listAccessibleRepos(fx.orgId)).rejects.toBeInstanceOf(GhTokenInvalidError)
  })

  it('maps 403 with x-ratelimit-remaining=0 to GhRateLimitedError with resetAt', async () => {
    await seedConnection(fx)
    const resetSec = Math.floor(Date.now() / 1000) + 600
    mocks.listForAuthenticatedUser.mockRejectedValueOnce(Object.assign(new Error('rate limited'), {
      status: 403,
      response: {
        status: 403,
        headers: {
          'x-ratelimit-remaining': '0',
          'x-ratelimit-reset': String(resetSec),
        },
      },
    }))

    const err = await service.listAccessibleRepos(fx.orgId).catch(e => e)
    expect(err).toBeInstanceOf(GhRateLimitedError)
    expect((err as GhRateLimitedError).resetAt).toBeInstanceOf(Date)
    expect((err as GhRateLimitedError).resetAt!.getTime()).toBe(resetSec * 1000)
  })

  it('maps 404 to GhResourceNotFoundError with the resource identifier', async () => {
    await seedConnection(fx)
    mocks.reposGet.mockRejectedValueOnce(Object.assign(new Error('Not found'), { status: 404 }))

    const err = await service.getRepo({ organisationId: fx.orgId, owner: 'octocat', name: 'missing' }).catch(e => e)
    expect(err).toBeInstanceOf(GhResourceNotFoundError)
    expect((err as GhResourceNotFoundError).resource).toBe('octocat/missing')
  })
})
