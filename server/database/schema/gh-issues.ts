import { bigint, index, integer, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core'
import { ghRepos } from './gh-repos'
import { organisations } from './organisations'

// GitHub issue state mirrors the upstream API: `open` | `closed`.
// `state_reason` (separate text column) captures the finer-grained
// `completed` / `not_planned` / `reopened` field.
export const ghIssueState = pgEnum('gh_issue_state', ['open', 'closed'])

// Cached GitHub issues per repository (REQ-PROJ-3, REQ-PROJ-5,
// DESIGN-DATA §Projects).
//
// `labels`, `assignees`, `author` are stored as denormalised JSON to avoid
// thrashing a join table on every sync — issues are read-only (REQ-PROJ-5)
// so we don't need referential integrity on these.
//
// `gh_*_at` timestamps are the upstream GitHub timestamps; `created_at` /
// `updated_at` are local row timestamps used for sync bookkeeping.
export const ghIssues = pgTable('gh_issues', {
  id: text('id').primaryKey(), // ULID
  organisationId: text('organisation_id').notNull().references(() => organisations.id, { onDelete: 'cascade' }),
  repoId: text('repo_id').notNull().references(() => ghRepos.id, { onDelete: 'cascade' }),
  ghId: bigint('gh_id', { mode: 'number' }).notNull(),
  number: integer('number').notNull(),
  title: text('title').notNull(),
  body: text('body'),
  state: ghIssueState('state').notNull(),
  stateReason: text('state_reason'),
  labels: jsonb('labels').notNull().default([]),
  assignees: jsonb('assignees').notNull().default([]),
  author: jsonb('author').notNull(),
  commentsCount: integer('comments_count').notNull().default(0),
  ghCreatedAt: timestamp('gh_created_at', { withTimezone: true }),
  ghUpdatedAt: timestamp('gh_updated_at', { withTimezone: true }),
  ghClosedAt: timestamp('gh_closed_at', { withTimezone: true }),
  htmlUrl: text('html_url').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, table => [
  uniqueIndex('gh_issues_repo_gh_id_unique').on(table.repoId, table.ghId),
  index('gh_issues_repo_state_idx').on(table.repoId, table.state),
])

export type GhIssue = typeof ghIssues.$inferSelect
export type NewGhIssue = typeof ghIssues.$inferInsert
