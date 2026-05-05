/**
 * Vault access-log helper (T-V-19, REQ-VAULT-19, DESIGN-VAULT-DATA).
 *
 * The vault access log captures every state change AND every reveal —
 * UI reveal, orchestrator reveal, lock/unlock — so the audit view
 * (T-V-29) can render a per-workspace timeline of who decrypted what
 * and when, regardless of channel.
 *
 * This module deliberately does NOT import the DI container — vault
 * tooling and the orchestrator chat-handler test path would otherwise
 * pull in every container-wired service (incl. content-creator) just
 * to write a log row. We resolve `getDatabase('app')` directly, the
 * same lazy seam container.ts uses, and run a typed insert via the
 * shared schema definition.
 */
import { ulid } from 'ulid'
import { vaultAccessLog } from '../../database/schema'
import { getDatabase } from '../../infrastructure/database/client'

export type VaultAccessEventType
  = | 'unlock'
    | 'lock'
    | 'auto_lock'
    | 'ui_reveal'
    | 'orchestrator_reveal'
    | 'orchestrator_search'
    | 'entry_create'
    | 'entry_update'
    | 'entry_delete'

export interface WriteVaultAccessLogInput {
  organisationId: string
  userId: string
  eventType: VaultAccessEventType
  entryId?: string | null
  /** For reveal events — `password`, `notes`, `custom:<key>`, etc. */
  fieldName?: string | null
  /** Free-text justification — only populated by `orchestrator_reveal`. */
  reason?: string | null
  /** Linked orchestrator conversation, if applicable. */
  conversationId?: string | null
}

export const writeVaultAccessLog = async (input: WriteVaultAccessLogInput) => {
  const db = getDatabase('app')
  const [row] = await db
    .insert(vaultAccessLog)
    .values({
      id: ulid(),
      organisationId: input.organisationId,
      userId: input.userId,
      eventType: input.eventType,
      entryId: input.entryId ?? null,
      fieldName: input.fieldName ?? null,
      reason: input.reason ?? null,
      conversationId: input.conversationId ?? null,
    })
    .returning()
  return row
}
