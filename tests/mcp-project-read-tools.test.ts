// DB-backed integration tests for the project read tools (T-4.7).
//
// Each tool is invoked at least once through the registry
// (`server.invoke(name, …)`) so the validate-and-shape pipeline is
// exercised end-to-end. Workspace scoping is asserted across two orgs.

import type { McpToolContext } from '../server/features/orchestrator/mcp-server'
import type {
  ProjectListCommitsOutput,
  ProjectListIssuesOutput,
  ProjectListPullsOutput,
  ProjectListReposOutput,
} from '../server/features/orchestrator/tools'
import { sql } from 'drizzle-orm'
import { ulid } from 'ulid'
import { beforeEach, describe, expect, it } from 'vitest'

import * as schema from '../server/database/schema'
import {
  createKbCategoryService,
  createKbEntryService,
  createKbTagService,
} from '../server/features/kb/service'
import { McpToolNotFoundEntityError } from '../server/features/orchestrator/errors'
import { createMcpServer } from '../server/features/orchestrator/mcp-server'
import { registerReadTools } from '../server/features/orchestrator/tools'
import { createTodoService } from '../server/features/todo/service'
import { getDatabase } from '../server/infrastructure/database/client'
import { createItemService } from '../server/infrastructure/database/item-service'

import { createOrganisationData } from './factories'

const db = getDatabase('app')

// Read services: only `db` matters for the project tools, but
// `registerReadTools` requires the full ReadToolDeps surface.
const kbCategoriesItemService = createItemService({ db, table: schema.kbCategories, tableName: 'kbCategories' })
const kbTagsItemService = createItemService({ db, table: schema.kbTags, tableName: 'kbTags' })
const kbEntriesItemService = createItemService({ db, table: schema.kbEntries, tableName: 'kbEntries' })
const todosItemService = createItemService({ db, table: schema.todos, tableName: 'todos' })

const kbCategoryService = createKbCategoryService({ kbCategoriesItemService })
const kbTagService = createKbTagService({ db, kbTagsItemService })
const kbEntryService = createKbEntryService({ db, kbEntriesItemService, kbTagService })
const todoService = createTodoService({ db, todosItemService, kbTagService })

const buildServer = () => {
  const server = createMcpServer()
  registerReadTools(server, {
    kbEntryService,
    kbCategoryService,
    kbTagService,
    todoService,
    db,
  })
  return server
}

const ctxFor = (organisationId: string): McpToolContext => ({
  organisationId,
  userId: 'user-test',
  conversationId: 'conv-test',
  mode: 'read_only',
})

const cleanProjectsTables = async () => {
  await db.execute(sql`TRUNCATE TABLE
    gh_commits,
    gh_issues,
    gh_pulls,
    gh_repos,
    gh_connections
    CASCADE`)
}

const seedOrg = async (): Promise<string> => {
  const data = createOrganisationData()
  const id = ulid()
  await db.insert(schema.organisations).values({
    id,
    name: data.name,
    slug: `${data.slug}-${id.slice(-6).toLowerCase()}`,
    cryptoSalt: data.cryptoSalt,
  })
  return id
}

interface SeedRepoOpts {
  ghId: number
  owner?: string
  name: string
  tracked?: boolean
  description?: string | null
  lastSyncedAt?: Date | null
}

const seedRepo = async (orgId: string, opts: SeedRepoOpts): Promise<string> => {
  const id = ulid()
  const owner = opts.owner ?? 'octocat'
  await db.insert(schema.ghRepos).values({
    id,
    organisationId: orgId,
    connectionId: null,
    ghId: opts.ghId,
    owner,
    name: opts.name,
    fullName: `${owner}/${opts.name}`,
    defaultBranch: 'main',
    private: false,
    description: opts.description ?? null,
    tracked: opts.tracked ?? true,
    lastSyncedAt: opts.lastSyncedAt ?? null,
  })
  return id
}

interface SeedIssueOpts {
  ghId: number
  number: number
  title: string
  state: 'open' | 'closed'
  ghUpdatedAt?: Date | null
  authorLogin?: string
  labels?: string[]
}

const seedIssue = async (orgId: string, repoId: string, opts: SeedIssueOpts) => {
  await db.insert(schema.ghIssues).values({
    id: ulid(),
    organisationId: orgId,
    repoId,
    ghId: opts.ghId,
    number: opts.number,
    title: opts.title,
    body: null,
    state: opts.state,
    stateReason: null,
    labels: opts.labels ?? [],
    assignees: [],
    author: { login: opts.authorLogin ?? 'alice' },
    commentsCount: 0,
    ghCreatedAt: opts.ghUpdatedAt ?? new Date('2026-01-01T00:00:00Z'),
    ghUpdatedAt: opts.ghUpdatedAt ?? new Date('2026-01-01T00:00:00Z'),
    ghClosedAt: null,
    htmlUrl: `https://github.com/octocat/repo/issues/${opts.number}`,
  })
}

interface SeedPullOpts {
  ghId: number
  number: number
  title: string
  state: 'open' | 'closed' | 'merged'
  ghUpdatedAt?: Date | null
}

const seedPull = async (orgId: string, repoId: string, opts: SeedPullOpts) => {
  await db.insert(schema.ghPulls).values({
    id: ulid(),
    organisationId: orgId,
    repoId,
    ghId: opts.ghId,
    number: opts.number,
    title: opts.title,
    body: null,
    state: opts.state,
    draft: false,
    baseRef: 'main',
    headRef: `feat-${opts.number}`,
    labels: [],
    assignees: [],
    requestedReviewers: [],
    author: { login: 'bob' },
    commentsCount: 0,
    additions: null,
    deletions: null,
    changedFiles: null,
    ghCreatedAt: opts.ghUpdatedAt ?? new Date('2026-01-01T00:00:00Z'),
    ghUpdatedAt: opts.ghUpdatedAt ?? new Date('2026-01-01T00:00:00Z'),
    ghClosedAt: opts.state === 'open' ? null : new Date('2026-01-02T00:00:00Z'),
    ghMergedAt: opts.state === 'merged' ? new Date('2026-01-02T00:00:00Z') : null,
    htmlUrl: `https://github.com/octocat/repo/pull/${opts.number}`,
  })
}

interface SeedCommitOpts {
  sha: string
  message: string
  authorName?: string | null
  authorLogin?: string | null
  authoredAt?: Date | null
}

const seedCommit = async (orgId: string, repoId: string, opts: SeedCommitOpts) => {
  await db.insert(schema.ghCommits).values({
    id: ulid(),
    organisationId: orgId,
    repoId,
    sha: opts.sha,
    message: opts.message,
    authorName: opts.authorName ?? 'Alice Author',
    authorEmail: 'alice@example.com',
    authorLogin: opts.authorLogin ?? 'alice',
    authorAvatarUrl: null,
    authoredAt: opts.authoredAt ?? new Date('2026-01-01T00:00:00Z'),
    committerLogin: null,
    committedAt: opts.authoredAt ?? new Date('2026-01-01T00:00:00Z'),
    htmlUrl: `https://github.com/octocat/repo/commit/${opts.sha}`,
    parents: [],
  })
}

interface Fixture {
  orgA: string
  orgB: string
  repoA1: string
  repoA2: string
}

const buildFixture = async (): Promise<Fixture> => {
  const orgA = await seedOrg()
  const orgB = await seedOrg()
  const repoA1 = await seedRepo(orgA, {
    ghId: 1,
    owner: 'octocat',
    name: 'alpha',
    tracked: true,
    description: 'first repo',
    lastSyncedAt: new Date('2026-01-03T00:00:00Z'),
  })
  const repoA2 = await seedRepo(orgA, {
    ghId: 2,
    owner: 'octocat',
    name: 'beta',
    tracked: false,
    description: null,
  })
  // Shadow rows in another workspace — must not leak.
  const repoB = await seedRepo(orgB, { ghId: 1, owner: 'octocat', name: 'alpha', tracked: true })
  await seedIssue(orgB, repoB, { ghId: 999, number: 1, title: 'cross-workspace issue', state: 'open' })
  await seedPull(orgB, repoB, { ghId: 998, number: 1, title: 'cross-workspace pr', state: 'open' })
  await seedCommit(orgB, repoB, { sha: 'b'.repeat(40), message: 'cross-workspace commit' })

  // Workspace A issues / pulls / commits.
  await seedIssue(orgA, repoA1, {
    ghId: 10,
    number: 1,
    title: 'Open: widget bug',
    state: 'open',
    ghUpdatedAt: new Date('2026-02-01T00:00:00Z'),
    labels: ['bug', 'good first issue'],
  })
  await seedIssue(orgA, repoA1, {
    ghId: 11,
    number: 2,
    title: 'Closed: legacy gadget',
    state: 'closed',
    ghUpdatedAt: new Date('2026-01-15T00:00:00Z'),
  })
  await seedIssue(orgA, repoA1, {
    ghId: 12,
    number: 3,
    title: 'Old issue',
    state: 'open',
    ghUpdatedAt: new Date('2025-06-01T00:00:00Z'),
  })

  await seedPull(orgA, repoA1, { ghId: 20, number: 10, title: 'feat: x', state: 'open' })
  await seedPull(orgA, repoA1, { ghId: 21, number: 11, title: 'feat: merged change', state: 'merged' })
  await seedPull(orgA, repoA1, { ghId: 22, number: 12, title: 'fix: closed wontfix', state: 'closed' })

  await seedCommit(orgA, repoA1, {
    sha: '1'.repeat(40),
    message: 'first commit',
    authorLogin: 'alice',
    authoredAt: new Date('2026-01-10T00:00:00Z'),
  })
  await seedCommit(orgA, repoA1, {
    sha: '2'.repeat(40),
    message: 'second commit',
    authorLogin: 'bob',
    authoredAt: new Date('2026-02-10T00:00:00Z'),
  })
  await seedCommit(orgA, repoA1, {
    sha: '3'.repeat(40),
    message: 'third commit',
    authorLogin: 'carol',
    authoredAt: new Date('2026-03-10T00:00:00Z'),
  })

  return { orgA, orgB, repoA1, repoA2 }
}

describe('project_list_repos (via registry)', () => {
  beforeEach(async () => {
    await cleanProjectsTables()
  })

  it('returns workspace-scoped repos only', async () => {
    const fx = await buildFixture()
    const server = buildServer()
    const res = await server.invoke<ProjectListReposOutput>(
      'project_list_repos',
      {},
      ctxFor(fx.orgA),
    )
    expect(res.toolName).toBe('project_list_repos')
    const fullNames = res.result.map(r => r.fullName).sort()
    expect(fullNames).toEqual(['octocat/alpha', 'octocat/beta'])
    // No row from orgB.
    expect(res.result.every(r => r.id === fx.repoA1 || r.id === fx.repoA2)).toBe(true)
    // htmlUrl is derived.
    const alpha = res.result.find(r => r.fullName === 'octocat/alpha')!
    expect(alpha.htmlUrl).toBe('https://github.com/octocat/alpha')
    expect(alpha.lastSyncedAt).toBe('2026-01-03T00:00:00.000Z')
    expect(alpha.tracked).toBe(true)
  })

  it('filters by tracked flag', async () => {
    const fx = await buildFixture()
    const server = buildServer()
    const onlyTracked = await server.invoke<ProjectListReposOutput>(
      'project_list_repos',
      { tracked: true },
      ctxFor(fx.orgA),
    )
    expect(onlyTracked.result.map(r => r.name)).toEqual(['alpha'])

    const onlyUntracked = await server.invoke<ProjectListReposOutput>(
      'project_list_repos',
      { tracked: false },
      ctxFor(fx.orgA),
    )
    expect(onlyUntracked.result.map(r => r.name)).toEqual(['beta'])
  })

  it('filters by q substring (name/owner/description)', async () => {
    const fx = await buildFixture()
    const server = buildServer()
    const byName = await server.invoke<ProjectListReposOutput>(
      'project_list_repos',
      { q: 'alph' },
      ctxFor(fx.orgA),
    )
    expect(byName.result.map(r => r.name)).toEqual(['alpha'])

    const byDesc = await server.invoke<ProjectListReposOutput>(
      'project_list_repos',
      { q: 'first repo' },
      ctxFor(fx.orgA),
    )
    expect(byDesc.result.map(r => r.name)).toEqual(['alpha'])
  })
})

describe('project_list_issues (via registry)', () => {
  beforeEach(async () => {
    await cleanProjectsTables()
  })

  it('defaults to state=open and is workspace-scoped', async () => {
    const fx = await buildFixture()
    const server = buildServer()
    const res = await server.invoke<ProjectListIssuesOutput>(
      'project_list_issues',
      {},
      ctxFor(fx.orgA),
    )
    expect(res.result.every(i => i.state === 'open')).toBe(true)
    expect(res.result.every(i => i.repoFullName === 'octocat/alpha')).toBe(true)
    // Shadow row in orgB must not leak.
    expect(res.result.find(i => i.title === 'cross-workspace issue')).toBeUndefined()
    // 2 open issues seeded for orgA.
    expect(res.result).toHaveLength(2)
    const top = res.result.find(i => i.title === 'Open: widget bug')!
    expect(top.author).toBe('alice')
    expect(top.labels).toEqual(['bug', 'good first issue'])
  })

  it('returns both open and closed when state=all, supports q filter and since cutoff', async () => {
    const fx = await buildFixture()
    const server = buildServer()
    const all = await server.invoke<ProjectListIssuesOutput>(
      'project_list_issues',
      { state: 'all' },
      ctxFor(fx.orgA),
    )
    expect(all.result).toHaveLength(3)

    const matched = await server.invoke<ProjectListIssuesOutput>(
      'project_list_issues',
      { state: 'all', q: 'gadget' },
      ctxFor(fx.orgA),
    )
    expect(matched.result.map(i => i.title)).toEqual(['Closed: legacy gadget'])

    const recent = await server.invoke<ProjectListIssuesOutput>(
      'project_list_issues',
      { state: 'all', since: '2026-01-01T00:00:00Z' },
      ctxFor(fx.orgA),
    )
    // Drops the 2025-06 issue.
    expect(recent.result.map(i => i.title).sort()).toEqual([
      'Closed: legacy gadget',
      'Open: widget bug',
    ])
  })

  it('throws McpToolNotFoundEntityError for an unknown repo slug', async () => {
    const fx = await buildFixture()
    const server = buildServer()
    await expect(
      server.invoke<ProjectListIssuesOutput>(
        'project_list_issues',
        { repo: 'octocat/does-not-exist' },
        ctxFor(fx.orgA),
      ),
    ).rejects.toBeInstanceOf(McpToolNotFoundEntityError)
  })

  it('accepts repo slug or repo id', async () => {
    const fx = await buildFixture()
    const server = buildServer()
    const bySlug = await server.invoke<ProjectListIssuesOutput>(
      'project_list_issues',
      { repo: 'octocat/alpha' },
      ctxFor(fx.orgA),
    )
    expect(bySlug.result.length).toBeGreaterThan(0)
    const byId = await server.invoke<ProjectListIssuesOutput>(
      'project_list_issues',
      { repo: fx.repoA1 },
      ctxFor(fx.orgA),
    )
    expect(byId.result.length).toBe(bySlug.result.length)
  })
})

describe('project_list_pulls (via registry)', () => {
  beforeEach(async () => {
    await cleanProjectsTables()
  })

  it('derives state=merged correctly', async () => {
    const fx = await buildFixture()
    const server = buildServer()
    const merged = await server.invoke<ProjectListPullsOutput>(
      'project_list_pulls',
      { state: 'merged' },
      ctxFor(fx.orgA),
    )
    expect(merged.result.map(p => p.title)).toEqual(['feat: merged change'])
    expect(merged.result[0].state).toBe('merged')
    expect(merged.result[0].baseRef).toBe('main')
    expect(merged.result[0].headRef.startsWith('feat-')).toBe(true)
  })

  it('state=all returns open, closed, and merged scoped to workspace', async () => {
    const fx = await buildFixture()
    const server = buildServer()
    const all = await server.invoke<ProjectListPullsOutput>(
      'project_list_pulls',
      { state: 'all' },
      ctxFor(fx.orgA),
    )
    expect(all.result).toHaveLength(3)
    const states = new Set(all.result.map(p => p.state))
    expect(states).toEqual(new Set(['open', 'closed', 'merged']))
    // Shadow PR from orgB excluded.
    expect(all.result.find(p => p.title === 'cross-workspace pr')).toBeUndefined()
  })
})

describe('project_list_commits (via registry)', () => {
  beforeEach(async () => {
    await cleanProjectsTables()
  })

  it('honours limit and since, scoped to the workspace', async () => {
    const fx = await buildFixture()
    const server = buildServer()
    const limited = await server.invoke<ProjectListCommitsOutput>(
      'project_list_commits',
      { repo: 'octocat/alpha', limit: 2 },
      ctxFor(fx.orgA),
    )
    expect(limited.result).toHaveLength(2)
    // Ordered by authoredAt desc — third (carol) first.
    expect(limited.result[0].authorLogin).toBe('carol')

    const recent = await server.invoke<ProjectListCommitsOutput>(
      'project_list_commits',
      { repo: 'octocat/alpha', since: '2026-02-01T00:00:00Z' },
      ctxFor(fx.orgA),
    )
    expect(recent.result.map(c => c.authorLogin)).toEqual(['carol', 'bob'])
  })

  it('throws McpToolNotFoundEntityError for an unknown repo slug', async () => {
    const fx = await buildFixture()
    const server = buildServer()
    await expect(
      server.invoke<ProjectListCommitsOutput>(
        'project_list_commits',
        { repo: 'octocat/missing' },
        ctxFor(fx.orgA),
      ),
    ).rejects.toBeInstanceOf(McpToolNotFoundEntityError)
  })

  it('filters commits by author login or git author name', async () => {
    const fx = await buildFixture()
    const server = buildServer()
    const byLogin = await server.invoke<ProjectListCommitsOutput>(
      'project_list_commits',
      { repo: 'octocat/alpha', author: 'alice' },
      ctxFor(fx.orgA),
    )
    expect(byLogin.result.map(c => c.sha)).toEqual(['1'.repeat(40)])

    const byName = await server.invoke<ProjectListCommitsOutput>(
      'project_list_commits',
      { repo: 'octocat/alpha', author: 'Alice Author' },
      ctxFor(fx.orgA),
    )
    expect(byName.result.length).toBeGreaterThanOrEqual(1)
  })
})
