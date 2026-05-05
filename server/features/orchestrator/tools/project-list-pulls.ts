// MCP read tool: project_list_pulls.
//
// Refs: DESIGN-TOOLS §Read tools (project_list_pulls), T-4.7, REQ-PROJ-5.
//
// Same shape as `project_list_issues` but reads `gh_pulls`. `state` accepts
// `merged` because the schema's `gh_pull_state` enum stores it as a flat
// value (T-4.3 derived `closed + merged_at != null` → `merged`).

import type { DatabaseClient } from '../../../infrastructure/database/client'
import type { Tool } from '../mcp-server'
import { and, desc, eq, gte, ilike, isNull, sql } from 'drizzle-orm'
import { z } from 'zod'
import { ghPulls } from '../../../database/schema/gh-pulls'
import { ghRepos } from '../../../database/schema/gh-repos'
import { McpToolNotFoundEntityError } from '../errors'
import { resolveWorkspaceRepoId } from './project-list-issues'

const TOOL_NAME = 'project_list_pulls'
const DEFAULT_LIMIT = 25
const MAX_LIMIT = 50

export const projectListPullsInputSchema = z.object({
  repo: z.string().trim().min(1).optional(),
  state: z.enum(['open', 'closed', 'merged', 'all']).optional(),
  q: z.string().trim().min(1).optional(),
  since: z.string().trim().min(1).optional(),
  limit: z.number().int().min(1).max(MAX_LIMIT).optional(),
})

export type ProjectListPullsInput = z.infer<typeof projectListPullsInputSchema>

export interface ProjectListPullsItem {
  id: string
  repoFullName: string
  number: number
  title: string
  state: 'open' | 'closed' | 'merged'
  htmlUrl: string
  ghCreatedAt: string | null
  ghUpdatedAt: string | null
  author: string | null
  labels: string[]
  baseRef: string
  headRef: string
}

export type ProjectListPullsOutput = ProjectListPullsItem[]

export interface CreateProjectListPullsToolDeps {
  db: DatabaseClient
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

export const createProjectListPullsTool = (
  deps: CreateProjectListPullsToolDeps,
): Tool<ProjectListPullsInput, ProjectListPullsOutput> => ({
  name: TOOL_NAME,
  description: 'List cached GitHub pull requests for a single repo (slug `owner/name` or repo id) or across all tracked repos in the workspace when `repo` is omitted. Filter by `state` (`open`/`closed`/`merged`/`all`, default `open`), substring `q` (title), and `since` ISO timestamp on `gh_updated_at`.',
  schema: projectListPullsInputSchema as unknown as z.ZodType<ProjectListPullsInput>,
  class: 'auto',
  mode: 'read',
  handler: async (input, ctx) => {
    const limit = input.limit ?? DEFAULT_LIMIT
    const state = input.state ?? 'open'

    const conditions = [
      eq(ghPulls.organisationId, ctx.organisationId),
      isNull(ghRepos.deletedAt),
    ]

    if (input.repo) {
      const repoId = await resolveWorkspaceRepoId(deps.db, ctx.organisationId, input.repo)
      if (!repoId)
        throw new McpToolNotFoundEntityError(TOOL_NAME, 'gh_repo', input.repo)
      conditions.push(eq(ghPulls.repoId, repoId))
    }
    else {
      conditions.push(eq(ghRepos.tracked, true))
    }

    if (state !== 'all')
      conditions.push(eq(ghPulls.state, state))

    if (input.q) {
      const pattern = `%${input.q}%`
      conditions.push(ilike(ghPulls.title, pattern))
    }

    if (input.since) {
      const sinceDate = parseSince(input.since)
      if (sinceDate)
        conditions.push(gte(ghPulls.ghUpdatedAt, sinceDate))
    }

    const rows = await deps.db
      .select({
        id: ghPulls.id,
        repoFullName: ghRepos.fullName,
        number: ghPulls.number,
        title: ghPulls.title,
        state: ghPulls.state,
        htmlUrl: ghPulls.htmlUrl,
        ghCreatedAt: ghPulls.ghCreatedAt,
        ghUpdatedAt: ghPulls.ghUpdatedAt,
        author: ghPulls.author,
        labels: ghPulls.labels,
        baseRef: ghPulls.baseRef,
        headRef: ghPulls.headRef,
      })
      .from(ghPulls)
      .innerJoin(ghRepos, eq(ghPulls.repoId, ghRepos.id))
      .where(and(...conditions))
      .orderBy(desc(sql`coalesce(${ghPulls.ghUpdatedAt}, ${ghPulls.ghCreatedAt})`), desc(ghPulls.id))
      .limit(limit)

    return rows.map(r => ({
      id: r.id,
      repoFullName: r.repoFullName,
      number: r.number,
      title: r.title,
      state: r.state as 'open' | 'closed' | 'merged',
      htmlUrl: r.htmlUrl,
      ghCreatedAt: r.ghCreatedAt ? r.ghCreatedAt.toISOString() : null,
      ghUpdatedAt: r.ghUpdatedAt ? r.ghUpdatedAt.toISOString() : null,
      author: extractLogin(r.author),
      labels: extractLabels(r.labels),
      baseRef: r.baseRef,
      headRef: r.headRef,
    }))
  },
})
