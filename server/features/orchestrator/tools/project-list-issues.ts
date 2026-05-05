// MCP read tool: project_list_issues.
//
// Refs: DESIGN-TOOLS §Read tools (project_list_issues), T-4.7, REQ-PROJ-5.
//
// Lists cached GitHub issues for one tracked repo (when `repo` provided) or
// all tracked repos in the workspace. Reads `gh_issues` joined with
// `gh_repos` for the repo full-name and tracked/deleted filtering.

import type { DatabaseClient } from '../../../infrastructure/database/client'
import type { Tool } from '../mcp-server'
import { and, desc, eq, gte, ilike, isNull, sql } from 'drizzle-orm'
import { z } from 'zod'
import { ghIssues } from '../../../database/schema/gh-issues'
import { ghRepos } from '../../../database/schema/gh-repos'
import { McpToolNotFoundEntityError } from '../errors'

const TOOL_NAME = 'project_list_issues'
const DEFAULT_LIMIT = 25
const MAX_LIMIT = 50

export const projectListIssuesInputSchema = z.object({
  repo: z.string().trim().min(1).optional(),
  state: z.enum(['open', 'closed', 'all']).optional(),
  q: z.string().trim().min(1).optional(),
  since: z.string().trim().min(1).optional(),
  limit: z.number().int().min(1).max(MAX_LIMIT).optional(),
})

export type ProjectListIssuesInput = z.infer<typeof projectListIssuesInputSchema>

export interface ProjectListIssuesItem {
  id: string
  repoFullName: string
  number: number
  title: string
  state: 'open' | 'closed'
  htmlUrl: string
  ghCreatedAt: string | null
  ghUpdatedAt: string | null
  author: string | null
  labels: string[]
}

export type ProjectListIssuesOutput = ProjectListIssuesItem[]

export interface CreateProjectListIssuesToolDeps {
  db: DatabaseClient
}

/**
 * Resolve a `repo` argument to a workspace-scoped repo id. Accepts either a
 * `owner/name` slug (full_name) or a ULID id. Returns null when not found —
 * the caller throws `McpToolNotFoundEntityError`.
 */
const resolveRepoId = async (
  db: DatabaseClient,
  organisationId: string,
  repo: string,
): Promise<string | null> => {
  // full_name match first; fall back to id match.
  const bySlug = await db
    .select({ id: ghRepos.id })
    .from(ghRepos)
    .where(and(
      eq(ghRepos.organisationId, organisationId),
      eq(ghRepos.fullName, repo),
      isNull(ghRepos.deletedAt),
    ))
    .limit(1)
  if (bySlug[0])
    return bySlug[0].id
  const byId = await db
    .select({ id: ghRepos.id })
    .from(ghRepos)
    .where(and(
      eq(ghRepos.organisationId, organisationId),
      eq(ghRepos.id, repo),
      isNull(ghRepos.deletedAt),
    ))
    .limit(1)
  return byId[0]?.id ?? null
}

const parseSince = (raw: string): Date | null => {
  const d = new Date(raw)
  if (Number.isNaN(d.getTime()))
    return null
  return d
}

const extractLogin = (author: unknown): string | null => {
  if (author && typeof author === 'object' && 'login' in author) {
    const login = (author as { login: unknown }).login
    if (typeof login === 'string')
      return login
  }
  return null
}

const extractLabels = (labels: unknown): string[] => {
  if (!Array.isArray(labels))
    return []
  return labels.filter((l): l is string => typeof l === 'string')
}

export const createProjectListIssuesTool = (
  deps: CreateProjectListIssuesToolDeps,
): Tool<ProjectListIssuesInput, ProjectListIssuesOutput> => ({
  name: TOOL_NAME,
  description: 'List cached GitHub issues for a single repo (slug `owner/name` or repo id) or across all tracked repos in the workspace when `repo` is omitted. Filter by `state` (default `open`), substring `q` (title), and `since` ISO timestamp on `gh_updated_at`.',
  schema: projectListIssuesInputSchema as unknown as z.ZodType<ProjectListIssuesInput>,
  class: 'auto',
  mode: 'read',
  handler: async (input, ctx) => {
    const limit = input.limit ?? DEFAULT_LIMIT
    const state = input.state ?? 'open'

    const conditions = [
      eq(ghIssues.organisationId, ctx.organisationId),
      isNull(ghRepos.deletedAt),
    ]

    if (input.repo) {
      const repoId = await resolveRepoId(deps.db, ctx.organisationId, input.repo)
      if (!repoId)
        throw new McpToolNotFoundEntityError(TOOL_NAME, 'gh_repo', input.repo)
      conditions.push(eq(ghIssues.repoId, repoId))
    }
    else {
      // No repo filter: only consider tracked repos in the workspace.
      conditions.push(eq(ghRepos.tracked, true))
    }

    if (state !== 'all')
      conditions.push(eq(ghIssues.state, state))

    if (input.q) {
      const pattern = `%${input.q}%`
      conditions.push(ilike(ghIssues.title, pattern))
    }

    if (input.since) {
      const sinceDate = parseSince(input.since)
      if (sinceDate)
        conditions.push(gte(ghIssues.ghUpdatedAt, sinceDate))
    }

    const rows = await deps.db
      .select({
        id: ghIssues.id,
        repoFullName: ghRepos.fullName,
        number: ghIssues.number,
        title: ghIssues.title,
        state: ghIssues.state,
        htmlUrl: ghIssues.htmlUrl,
        ghCreatedAt: ghIssues.ghCreatedAt,
        ghUpdatedAt: ghIssues.ghUpdatedAt,
        author: ghIssues.author,
        labels: ghIssues.labels,
      })
      .from(ghIssues)
      .innerJoin(ghRepos, eq(ghIssues.repoId, ghRepos.id))
      .where(and(...conditions))
      .orderBy(desc(sql`coalesce(${ghIssues.ghUpdatedAt}, ${ghIssues.ghCreatedAt})`), desc(ghIssues.id))
      .limit(limit)

    return rows.map(r => ({
      id: r.id,
      repoFullName: r.repoFullName,
      number: r.number,
      title: r.title,
      state: r.state as 'open' | 'closed',
      htmlUrl: r.htmlUrl,
      ghCreatedAt: r.ghCreatedAt ? r.ghCreatedAt.toISOString() : null,
      ghUpdatedAt: r.ghUpdatedAt ? r.ghUpdatedAt.toISOString() : null,
      author: extractLogin(r.author),
      labels: extractLabels(r.labels),
    }))
  },
})

// Re-exported so the pulls/commits tools can share repo resolution.
export { resolveRepoId as resolveWorkspaceRepoId }
