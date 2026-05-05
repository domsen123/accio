// MCP read tool: project_list_commits.
//
// Refs: DESIGN-TOOLS §Read tools (project_list_commits), T-4.7, REQ-PROJ-5.
//
// `repo` is required for commits because the cache holds last-50-per-repo and
// listing across all repos in the workspace would mix unrelated histories.

import type { DatabaseClient } from '../../../infrastructure/database/client'
import type { Tool } from '../mcp-server'
import { and, desc, eq, gte, or } from 'drizzle-orm'
import { z } from 'zod'
import { ghCommits } from '../../../database/schema/gh-commits'
import { McpToolNotFoundEntityError } from '../errors'
import { resolveWorkspaceRepoId } from './project-list-issues'

const TOOL_NAME = 'project_list_commits'
const DEFAULT_LIMIT = 25
const MAX_LIMIT = 50

export const projectListCommitsInputSchema = z.object({
  repo: z.string().trim().min(1),
  since: z.string().trim().min(1).optional(),
  author: z.string().trim().min(1).optional(),
  limit: z.number().int().min(1).max(MAX_LIMIT).optional(),
})

export type ProjectListCommitsInput = z.infer<typeof projectListCommitsInputSchema>

export interface ProjectListCommitsItem {
  sha: string
  message: string
  authorName: string | null
  authorLogin: string | null
  authoredAt: string | null
  htmlUrl: string
}

export type ProjectListCommitsOutput = ProjectListCommitsItem[]

export interface CreateProjectListCommitsToolDeps {
  db: DatabaseClient
}

const parseSince = (raw: string): Date | null => {
  const d = new Date(raw)
  if (Number.isNaN(d.getTime()))
    return null
  return d
}

export const createProjectListCommitsTool = (
  deps: CreateProjectListCommitsToolDeps,
): Tool<ProjectListCommitsInput, ProjectListCommitsOutput> => ({
  name: TOOL_NAME,
  description: 'List cached commits for a single repo (slug `owner/name` or repo id). Filter by `since` ISO timestamp (matches `authored_at`) and `author` (matches GitHub login or git author name).',
  schema: projectListCommitsInputSchema as unknown as z.ZodType<ProjectListCommitsInput>,
  class: 'auto',
  mode: 'read',
  handler: async (input, ctx) => {
    const limit = input.limit ?? DEFAULT_LIMIT

    const repoId = await resolveWorkspaceRepoId(deps.db, ctx.organisationId, input.repo)
    if (!repoId)
      throw new McpToolNotFoundEntityError(TOOL_NAME, 'gh_repo', input.repo)

    const conditions = [
      eq(ghCommits.organisationId, ctx.organisationId),
      eq(ghCommits.repoId, repoId),
    ]

    if (input.since) {
      const sinceDate = parseSince(input.since)
      if (sinceDate)
        conditions.push(gte(ghCommits.authoredAt, sinceDate))
    }

    if (input.author) {
      const authorCond = or(
        eq(ghCommits.authorLogin, input.author),
        eq(ghCommits.authorName, input.author),
      )
      if (authorCond)
        conditions.push(authorCond)
    }

    const rows = await deps.db
      .select({
        sha: ghCommits.sha,
        message: ghCommits.message,
        authorName: ghCommits.authorName,
        authorLogin: ghCommits.authorLogin,
        authoredAt: ghCommits.authoredAt,
        htmlUrl: ghCommits.htmlUrl,
      })
      .from(ghCommits)
      .where(and(...conditions))
      .orderBy(desc(ghCommits.authoredAt))
      .limit(limit)

    return rows.map(r => ({
      sha: r.sha,
      message: r.message,
      authorName: r.authorName,
      authorLogin: r.authorLogin,
      authoredAt: r.authoredAt ? r.authoredAt.toISOString() : null,
      htmlUrl: r.htmlUrl,
    }))
  },
})
