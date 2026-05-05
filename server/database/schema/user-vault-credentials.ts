import { jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core'
import { bytea } from './column-types'
import { users } from './users'

// Per-user vault credentials (DESIGN-VAULT-DATA, REQ-VAULT-1, REQ-VAULT-2).
//
// The master password itself is never stored — only an Argon2id verifier
// derived from `master_salt` plus the params recorded in `argon2_params`.
// `master_kdf_salt` is a *separate* salt used at unlock time to re-derive the
// 32-byte master key (DESIGN-VAULT-CRYPTO §Verifier vs. KDF).
//
// One row per user: the same master password protects every workspace the
// user provisions, so there's no organisation FK here.
export const userVaultCredentials = pgTable('user_vault_credentials', {
  userId: text('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  masterSalt: bytea('master_salt').notNull(),
  masterVerifier: bytea('master_verifier').notNull(),
  masterKdfSalt: bytea('master_kdf_salt').notNull(),
  argon2Params: jsonb('argon2_params').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export type UserVaultCredential = typeof userVaultCredentials.$inferSelect
export type NewUserVaultCredential = typeof userVaultCredentials.$inferInsert
