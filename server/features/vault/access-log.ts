/**
 * Vault access-log helper (T-V-19, REQ-VAULT-19, DESIGN-VAULT-DATA).
 *
 * The vault access log captures every state change AND every reveal —
 * UI reveal, orchestrator reveal, lock/unlock — so the audit view
 * (T-V-29) can render a per-workspace timeline of who decrypted what
 * and when, regardless of channel.
 *
 * This is a thin wrapper around `container.items.vaultAccessLog.create`
 * that gives callers a typed `eventType` and a single seam to extend
 * if we ever batch or async-flush logs (we don't today — synchronous
 * inserts inside the request keep "the log shows the action" tight).
 */
import { container } from '../../utils/container'

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
  return container.items.vaultAccessLog.create({
    organisationId: input.organisationId,
    userId: input.userId,
    eventType: input.eventType,
    entryId: input.entryId ?? null,
    fieldName: input.fieldName ?? null,
    reason: input.reason ?? null,
    conversationId: input.conversationId ?? null,
  })
}
