import { bigint, boolean, index, integer, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core'
import { ghRepos } from './gh-repos'
import { organisations } from './organisations'

// GitHub PR state: `merged` is a derived state in the upstream API
// (`state=closed` + `merged_at != null`) — we flatten it here to make
// "open / closed-without-merge / merged" filterable in one column.
export const ghPullState = pgEnum('gh_pull_state', ['open', 'closed', 'merged'])

// Cached GitHub pull requests per repository (REQ-PROJ-3, REQ-PROJ-5,
// DESIGN-DATA §Projects).
//
// Storage shape mirrors `gh_issues` — labels/assignees/reviewers/author are
// denormalised JSON. `additions` / `deletions` / `changed_files` are nullable
// because they are populated by a follow-up GET on the PR detail endpoint
// (the list endpoint omits them).
export const ghPulls = pgTable('gh_pulls', {
  id: text('id').primaryKey(), // ULID
  organisationId: text('organisation_id').notNull().references(() => organisations.id, { onDelete: 'cascade' }),
  repoId: text('repo_id').notNull().references(() => ghRepos.id, { onDelete: 'cascade' }),
  ghId: bigint('gh_id', { mode: 'number' }).notNull(),
  number: integer('number').notNull(),
  title: text('title').notNull(),
  body: text('body'),
  state: ghPullState('state').notNull(),
  draft: boolean('draft').notNull().default(false),
  baseRef: text('base_ref').notNull(),
  headRef: text('head_ref').notNull(),
  labels: jsonb('labels').notNull().default([]),
  assignees: jsonb('assignees').notNull().default([]),
  requestedReviewers: jsonb('requested_reviewers').notNull().default([]),
  author: jsonb('author').notNull(),
  commentsCount: integer('comments_count').notNull().default(0),
  additions: integer('additions'),
  deletions: integer('deletions'),
  changedFiles: integer('changed_files'),
  ghCreatedAt: timestamp('gh_created_at', { withTimezone: true }),
  ghUpdatedAt: timestamp('gh_updated_at', { withTimezone: true }),
  ghClosedAt: timestamp('gh_closed_at', { withTimezone: true }),
  ghMergedAt: timestamp('gh_merged_at', { withTimezone: true }),
  htmlUrl: text('html_url').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, table => [
  uniqueIndex('gh_pulls_repo_gh_id_unique').on(table.repoId, table.ghId),
  index('gh_pulls_repo_state_idx').on(table.repoId, table.state),
])

export type GhPull = typeof ghPulls.$inferSelect
export type NewGhPull = typeof ghPulls.$inferInsert
