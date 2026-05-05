import { bigint, jsonb, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core'
import { organisations } from './organisations'

// GitHub connection per workspace (REQ-PROJ-1, DESIGN-DATA §Projects).
//
// One connection per workspace: enforced by a UNIQUE on `organisation_id`.
// `token_encrypted` stores the GitHub PAT encrypted at rest with the app
// secret; the encryption layer is wired up in T-4.2.
//
// `gh_user_id` is GitHub's stable numeric user id — useful for sanity checks
// when a token is rotated (login can change; numeric id cannot).
//
// `scopes` records the scopes the token reports (from the
// `X-OAuth-Scopes` header on `GET /user`) so the UI can warn about missing
// scopes without re-validating every request.
//
// `last_validated_at` records the last successful `GET /user` validation —
// surfaced in the UI alongside the connection.
export const ghConnections = pgTable('gh_connections', {
  id: text('id').primaryKey(), // ULID
  organisationId: text('organisation_id').notNull().references(() => organisations.id, { onDelete: 'cascade' }),
  tokenEncrypted: text('token_encrypted').notNull(),
  ghUserLogin: text('gh_user_login').notNull(),
  ghUserId: bigint('gh_user_id', { mode: 'number' }).notNull(),
  scopes: jsonb('scopes').notNull().default([]),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  lastValidatedAt: timestamp('last_validated_at', { withTimezone: true }),
}, table => [
  uniqueIndex('gh_connections_org_unique').on(table.organisationId),
])

export type GhConnection = typeof ghConnections.$inferSelect
export type NewGhConnection = typeof ghConnections.$inferInsert
