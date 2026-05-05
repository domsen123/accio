// MCP read tool: project_list_repos.
//
// Refs: DESIGN-TOOLS §Read tools (project_list_repos), T-4.7, REQ-PROJ-5.
//
// Lists cached GitHub repositories scoped to the caller's workspace. No
// upstream API call — reads `gh_repos` rows previously hydrated by the sync
// service (T-4.4 / T-4.5). Soft-deleted repos are excluded.

import type { DatabaseClient } from '../../../infrastructure/database/client'
import type { Tool } from '../mcp-server'
import { and, asc, eq, ilike, isNull, or, sql } from 'drizzle-orm'
import { z } from 'zod'
import { ghRepos } from '../../../database/schema/gh-repos'

const TOOL_NAME = 'project_list_repos'
const DEFAULT_LIMIT = 25
const MAX_LIMIT = 50

export const projectListReposInputSchema = z.object({
  tracked: z.boolean().optional(),
  q: z.string().trim().min(1).optional(),
  limit: z.number().int().min(1).max(MAX_LIMIT).optional(),
})

export type ProjectListReposInput = z.infer<typeof projectListReposInputSchema>

export interface ProjectListReposItem {
  id: string
  ghId: number
  owner: string
  name: string
  fullName: string
  description: string | null
  private: boolean
  tracked: boolean
  lastSyncedAt: string | null
  htmlUrl: string
}

export type ProjectListReposOutput = ProjectListReposItem[]

export interface CreateProjectListReposToolDeps {
  db: DatabaseClient
}

export const createProjectListReposTool = (
  deps: CreateProjectListReposToolDeps,
): Tool<ProjectListReposInput, ProjectListReposOutput> => ({
  name: TOOL_NAME,
  description: 'List cached GitHub repositories tracked by this workspace. Filter by `tracked` flag and a substring query `q` against owner/name/full_name/description.',
  schema: projectListReposInputSchema as unknown as z.ZodType<ProjectListReposInput>,
  class: 'auto',
  mode: 'read',
  handler: async (input, ctx) => {
    const limit = input.limit ?? DEFAULT_LIMIT
    const conditions = [
      eq(ghRepos.organisationId, ctx.organisationId),
      isNull(ghRepos.deletedAt),
    ]
    if (input.tracked !== undefined)
      conditions.push(eq(ghRepos.tracked, input.tracked))
    if (input.q) {
      const pattern = `%${input.q}%`
      const qCond = or(
        ilike(ghRepos.owner, pattern),
        ilike(ghRepos.name, pattern),
        ilike(ghRepos.fullName, pattern),
        ilike(ghRepos.description, pattern),
      )
      if (qCond)
        conditions.push(qCond)
    }

    const rows = await deps.db
      .select({
        id: ghRepos.id,
        ghId: ghRepos.ghId,
        owner: ghRepos.owner,
        name: ghRepos.name,
        fullName: ghRepos.fullName,
        description: ghRepos.description,
        private: ghRepos.private,
        tracked: ghRepos.tracked,
        lastSyncedAt: ghRepos.lastSyncedAt,
        // gh_repos has no `html_url` column — derive it deterministically.
        htmlUrl: sql<string>`'https://github.com/' || ${ghRepos.fullName}`,
      })
      .from(ghRepos)
      .where(and(...conditions))
      .orderBy(asc(ghRepos.fullName))
      .limit(limit)

    return rows.map(r => ({
      id: r.id,
      ghId: r.ghId,
      owner: r.owner,
      name: r.name,
      fullName: r.fullName,
      description: r.description,
      private: r.private,
      tracked: r.tracked,
      lastSyncedAt: r.lastSyncedAt ? r.lastSyncedAt.toISOString() : null,
      htmlUrl: r.htmlUrl,
    }))
  },
})
