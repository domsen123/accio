/**
 * Deep-link helpers for the projects feature (T-4.8, REQ-PROJ-4).
 *
 * REQ-PROJ-4 says: "Deep-links to github.dev / github.com per repo / issue
 * / PR". The `html_url` from GitHub's API is the source of truth for issue
 * and PR links and is stored verbatim on `gh_issues` / `gh_pulls`
 * (`htmlUrl`). For repository-level deep-links the UI builds the URL
 * client-side: `https://github.dev/<owner>/<name>` opens the repo in the
 * web editor and `https://github.com/<owner>/<name>` is the canonical repo
 * page.
 */

const isSafeSegment = (s: string): boolean => /^[\w.-]+$/.test(s)

const sanitiseSegment = (raw: string): string => {
  const trimmed = raw.trim()
  if (!isSafeSegment(trimmed))
    throw new Error(`Invalid GitHub path segment: ${raw}`)
  return trimmed
}

/**
 * Build a `https://github.dev/<owner>/<repo>` URL. Throws if either segment
 * contains characters outside `[A-Za-z0-9._-]` — github.dev / github.com use
 * the same path syntax as the repository slug, which is restricted to that
 * alphabet. We refuse to encode garbage instead of producing a tooltip-only
 * link the browser will reject.
 */
export const formatGithubDevUrl = (owner: string, name: string): string =>
  `https://github.dev/${sanitiseSegment(owner)}/${sanitiseSegment(name)}`

/** Companion helper for the canonical repo page on github.com. */
export const formatGithubRepoUrl = (owner: string, name: string): string =>
  `https://github.com/${sanitiseSegment(owner)}/${sanitiseSegment(name)}`
