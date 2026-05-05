import { bigint, boolean, index, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core'
import { ghConnections } from './gh-connections'
import { organisations } from './organisations'

// Tracked GitHub repositories per workspace (REQ-PROJ-2, REQ-PROJ-3,
// DESIGN-DATA §Projects).
//
// `connection_id` is nullable + `ON DELETE SET NULL` (T-4.2, migration 0007).
// REQ-PROJ-1 requires that revoking a connection retains cached data; the
// FK was originally CASCADE in T-4.1 and corrected here so revoke can
// `DELETE` the `gh_connections` row without wiping cached repos. The
// service layer (`connections.service.ts`) exposes an explicit
// `purgeData: true` flag on `revoke` for the "also drop cached data" flow.
//
// `full_name` is stored as a denormalised `owner/name` for query/display
// convenience — kept in sync at the service layer.
//
// `tracked` is the user opt-in flag (REQ-PROJ-2). Only `tracked = true`
// repos are synced (REQ-PROJ-3). `last_synced_at` is updated by the sync
// job and surfaced in the UI.
//
// Soft-delete via `deleted_at` keeps cached payloads even if a repo is
// removed upstream.
export const ghRepos = pgTable('gh_repos', {
  id: text('id').primaryKey(), // ULID
  organisationId: text('organisation_id').notNull().references(() => organisations.id, { onDelete: 'cascade' }),
  connectionId: text('connection_id').references(() => ghConnections.id, { onDelete: 'set null' }),
  ghId: bigint('gh_id', { mode: 'number' }).notNull(),
  owner: text('owner').notNull(),
  name: text('name').notNull(),
  fullName: text('full_name').notNull(),
  defaultBranch: text('default_branch'),
  private: boolean('private').notNull().default(false),
  description: text('description'),
  tracked: boolean('tracked').notNull().default(false),
  lastSyncedAt: timestamp('last_synced_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
}, table => [
  uniqueIndex('gh_repos_org_gh_id_unique').on(table.organisationId, table.ghId),
  index('gh_repos_org_tracked_idx').on(table.organisationId, table.tracked),
])

export type GhRepo = typeof ghRepos.$inferSelect
export type NewGhRepo = typeof ghRepos.$inferInsert
