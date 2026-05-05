import { index, pgEnum, pgTable, text, timestamp } from 'drizzle-orm/pg-core'
import { orchestratorConversations } from './orchestrator-conversations'
import { organisations } from './organisations'
import { users } from './users'
import { vaultEntries } from './vault-entries'

// Vault access events (DESIGN-VAULT-DATA, REQ-VAULT-19).
//
// Distinct from `orchestrator_actions`: this log captures every state change
// AND every reveal — UI reveals, orchestrator reveals, lock/unlock — so
// auditors can see what was decrypted and when, regardless of channel.
export const vaultAccessEventType = pgEnum('vault_access_event_type', [
  'unlock',
  'lock',
  'auto_lock',
  'ui_reveal',
  'orchestrator_reveal',
  'orchestrator_search',
  'entry_create',
  'entry_update',
  'entry_delete',
])

// `entry_id` is nullable: `unlock` / `lock` events have no associated entry.
// `field_name` is free-form — for custom fields the convention is
// `custom:<field_key>`. `reason` is populated for `orchestrator_reveal` and
// echoes the LLM-supplied justification (REQ-VAULT-15).
//
// FKs use ON DELETE SET NULL/CASCADE so deleting a workspace removes its
// log; deleting a single entry keeps the log row but nulls the FK so
// historical queries still surface "entry deleted at <ts>" with the entry's
// id retained in the row.
//
// Postgres truncates the auto-generated `conversation_id` FK name from 67
// chars to 63 (the identifier limit). Drizzle's snapshot keeps the full
// name so future diffs are stable; the live constraint just has the
// truncated form. This is a known cosmetic divergence — do not "fix" by
// regenerating without `IF EXISTS` guards.
export const vaultAccessLog = pgTable('vault_access_log', {
  id: text('id').primaryKey(), // ULID
  organisationId: text('organisation_id').notNull().references(() => organisations.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  entryId: text('entry_id').references(() => vaultEntries.id, { onDelete: 'set null' }),
  eventType: vaultAccessEventType('event_type').notNull(),
  fieldName: text('field_name'),
  reason: text('reason'),
  conversationId: text('conversation_id').references(() => orchestratorConversations.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, table => [
  index('vault_access_log_org_created_idx').on(table.organisationId, table.createdAt),
  index('vault_access_log_org_event_idx').on(table.organisationId, table.eventType),
])

export type VaultAccessLogEntry = typeof vaultAccessLog.$inferSelect
export type NewVaultAccessLogEntry = typeof vaultAccessLog.$inferInsert
