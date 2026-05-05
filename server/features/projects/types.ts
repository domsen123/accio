// Normalised GitHub API snapshot shapes (T-4.3).
//
// These mirror the columns of `gh_repos`, `gh_issues`, `gh_pulls`, and
// `gh_commits` so that T-4.4's sync service can perform straight inserts
// without re-shaping. The wrapper in `github-client.ts` is responsible for
// flattening Octokit's response shapes into these.
//
// Refs: REQ-PROJ-2 (list accessible repos), REQ-PROJ-3 (sync repo metadata,
// open issues, open PRs, last 50 commits), REQ-PROJ-5 (read-only display).

/**
 * One author/assignee/reviewer entry as denormalised JSON. Mirrors GitHub's
 * lightweight user object — login is always present; `id` and `avatar_url`
 * are best-effort. Stored verbatim into the JSON columns of `gh_issues`,
 * `gh_pulls`, and `gh_commits`.
 */
export interface GhUserRef {
  login: string
  id?: number
  avatarUrl?: string | null
}

/**
 * Normalised repository snapshot. Mirrors `gh_repos` columns plus the
 * upstream timestamps we want to surface in the UI (REQ-PROJ-5). The wrapper
 * does NOT decide whether the repo is `tracked` — that is a workspace
 * preference owned by T-4.4's sync service / the picker UI.
 */
export interface RepoSnapshot {
  ghId: number
  owner: string
  name: string
  fullName: string
  description: string | null
  private: boolean
  defaultBranch: string | null
  htmlUrl: string
  ghCreatedAt: Date | null
  ghUpdatedAt: Date | null
}

/**
 * Normalised issue snapshot. Mirrors `gh_issues` columns. Excludes pull
 * requests — `GET /repos/.../issues` returns PRs in the same payload (with
 * a `pull_request` field), and the wrapper filters them out before returning.
 */
export interface IssueSnapshot {
  ghId: number
  number: number
  title: string
  body: string | null
  state: 'open' | 'closed'
  stateReason: string | null
  labels: string[]
  assignees: GhUserRef[]
  author: GhUserRef
  commentsCount: number
  ghCreatedAt: Date | null
  ghUpdatedAt: Date | null
  ghClosedAt: Date | null
  htmlUrl: string
}

/**
 * Normalised pull-request snapshot. Mirrors `gh_pulls` columns.
 *
 * `state` is derived: GitHub's API returns `open | closed`; we promote
 * `closed + merged_at != null` to `merged` so the column matches the
 * `gh_pull_state` enum.
 *
 * Diff stats (`additions` / `deletions` / `changedFiles`) are NOT populated
 * by the list endpoint — `GET /repos/.../pulls` omits them. The wrapper
 * leaves them `null`; T-4.4's sync service can hydrate per-PR via
 * `GET /repos/.../pulls/{number}` if it cares.
 */
export interface PullSnapshot {
  ghId: number
  number: number
  title: string
  body: string | null
  state: 'open' | 'closed' | 'merged'
  draft: boolean
  baseRef: string
  headRef: string
  labels: string[]
  assignees: GhUserRef[]
  requestedReviewers: GhUserRef[]
  author: GhUserRef
  commentsCount: number
  additions: number | null
  deletions: number | null
  changedFiles: number | null
  ghCreatedAt: Date | null
  ghUpdatedAt: Date | null
  ghClosedAt: Date | null
  ghMergedAt: Date | null
  htmlUrl: string
}

/**
 * Normalised commit snapshot. Mirrors `gh_commits` columns.
 *
 * `authorLogin` / `authorAvatarUrl` are nullable because the git author
 * identity (name/email) may not correspond to a GitHub user (commits
 * authored by external contributors before they signed up, etc).
 */
export interface CommitSnapshot {
  sha: string
  message: string
  authorName: string | null
  authorEmail: string | null
  authorLogin: string | null
  authorAvatarUrl: string | null
  authoredAt: Date | null
  committerLogin: string | null
  committedAt: Date | null
  htmlUrl: string
  parents: string[]
}
