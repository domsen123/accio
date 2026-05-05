import { desc } from 'drizzle-orm'
import { index, jsonb, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core'
import { ghRepos } from './gh-repos'
import { organisations } from './organisations'

// Cached GitHub commits per repository — last 50 per tracked repo
// (REQ-PROJ-3). REQ-PROJ-5 surfaces SHA / message / author / date.
//
// Author and committer are split: a commit's git author identity (name/email)
// may not correspond to a GitHub user, so `author_login` / `author_avatar_url`
// are nullable. `committer_login` is similarly best-effort.
//
// `parents` is a JSON array of parent SHA strings — preserves merge history
// without requiring a separate join table.
//
// Index uses `authored_at DESC` to make the "recent commits" listing
// (REQ-PROJ-5) cheap.
export const ghCommits = pgTable('gh_commits', {
  id: text('id').primaryKey(), // ULID
  organisationId: text('organisation_id').notNull().references(() => organisations.id, { onDelete: 'cascade' }),
  repoId: text('repo_id').notNull().references(() => ghRepos.id, { onDelete: 'cascade' }),
  sha: text('sha').notNull(), // 40-char git SHA
  message: text('message').notNull(),
  authorName: text('author_name'),
  authorEmail: text('author_email'),
  authorLogin: text('author_login'),
  authorAvatarUrl: text('author_avatar_url'),
  authoredAt: timestamp('authored_at', { withTimezone: true }),
  committerLogin: text('committer_login'),
  committedAt: timestamp('committed_at', { withTimezone: true }),
  htmlUrl: text('html_url').notNull(),
  parents: jsonb('parents').notNull().default([]),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, table => [
  uniqueIndex('gh_commits_repo_sha_unique').on(table.repoId, table.sha),
  index('gh_commits_repo_authored_at_idx').on(table.repoId, desc(table.authoredAt)),
])

export type GhCommit = typeof ghCommits.$inferSelect
export type NewGhCommit = typeof ghCommits.$inferInsert
