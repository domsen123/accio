// MCP write-equivalent tool: vault_get_secret (T-V-21, REQ-VAULT-15,
// DESIGN-VAULT-TOOLS).
//
// Always classified `confirm`: the user must click "Confirm" in the chat
// UI before the tool runs. The confirmation card carries the warning
// "The secret will be sent to the LLM provider. Confirm only if
// necessary." (T-V-22 surfaces this in the UI.)
//
// Permission model: the chat handler conditionally registers this tool
// only when the user has `vault:orchestrator:reveal`. As an
// belt-and-braces measure the handler also returns
// `{ error: 'permission_denied' }` if invoked without that permission —
// future wiring change can't accidentally widen exposure.
//
// Audit: writes to `vault_access_log` with
// `event_type=orchestrator_reveal`, including the supplied `reason`,
// regardless of whether the user confirmed or cancelled. Cancellations
// reach the audit-log via `recordCancelled` on the orchestrator audit
// service — T-V-21 notes documents the split.

import type { VaultService } from '../../vault/service'
import type { VaultSessionStore } from '../../vault/session-store'
import type { Tool } from '../mcp-server'
import { Buffer } from 'node:buffer'
import { z } from 'zod'
import { writeVaultAccessLog } from '../../vault/access-log'

const FIELD_REGEX = /^(?:username|password|notes|custom:[\w\- ]{1,80})$/

export const vaultGetSecretInputSchema = z.object({
  entry_id: z.string().min(1),
  field: z.string().regex(FIELD_REGEX, 'invalid field name'),
  reason: z.string().trim().min(1).max(500),
})

export type VaultGetSecretInput = z.infer<typeof vaultGetSecretInputSchema>

export type VaultGetSecretOutput
  = | { value: string }
    | { error: 'vault_locked' }
    | { error: 'permission_denied' }
    | { error: 'entry_not_found' }
    | { error: 'field_not_found' }

export interface CreateVaultGetSecretToolDeps {
  vaultService: VaultService
  vaultSessionStore: VaultSessionStore
}

const resolveFieldValue = (
  payload: Awaited<ReturnType<VaultService['getEntry']>> extends infer R
    ? R extends null ? never : R extends { payload: infer P } ? P : never
    : never,
  field: string,
): string | null => {
  if (field === 'username')
    return payload.username
  if (field === 'password')
    return payload.password
  if (field === 'notes')
    return payload.notes
  if (field.startsWith('custom:')) {
    const name = field.slice('custom:'.length)
    const cf = payload.customFields.find(f => f.name === name)
    return cf ? cf.value : null
  }
  return null
}

export const createVaultGetSecretTool = (
  deps: CreateVaultGetSecretToolDeps,
): Tool<VaultGetSecretInput, VaultGetSecretOutput> => ({
  name: 'vault_get_secret',
  description: 'Reveal a single secret field of a vault entry. Always requires user confirmation. The secret will be sent to the LLM provider — confirm only if necessary.',
  schema: vaultGetSecretInputSchema as unknown as z.ZodType<VaultGetSecretInput>,
  class: 'confirm',
  // Mode is `read` because the tool reads from the vault and does not
  // mutate it. The LLM-provider exposure is the security concern; the
  // confirm class enforces the user gate.
  mode: 'read',
  handler: async (input, ctx): Promise<VaultGetSecretOutput> => {
    const { vaultService, vaultSessionStore } = deps

    if (!ctx.sessionId) {
      return { error: 'permission_denied' }
    }

    const session = vaultSessionStore.getSession(ctx.userId, ctx.sessionId, { touch: false })
    if (!session) {
      return { error: 'vault_locked' }
    }

    // Copy the master key out of the session before any await — the
    // sweeper can zero the live buffer between event-loop ticks.
    const masterKey: Buffer = (() => {
      const src = session.masterKey
      const buf = Buffer.allocUnsafe(src.length)
      src.copy(buf)
      return buf
    })()

    try {
      const fetched = await vaultService.getEntry({
        id: input.entry_id,
        organisationId: ctx.organisationId,
        masterKey,
      })
      if (!fetched) {
        return { error: 'entry_not_found' }
      }

      const value = resolveFieldValue(fetched.payload, input.field)
      if (value === null) {
        return { error: 'field_not_found' }
      }

      // Audit AFTER successful resolve — the field name plus reason go
      // into the access log so the user can audit their own AI's reveal
      // history later.
      await writeVaultAccessLog({
        organisationId: ctx.organisationId,
        userId: ctx.userId,
        eventType: 'orchestrator_reveal',
        entryId: input.entry_id,
        fieldName: input.field,
        reason: input.reason,
        conversationId: ctx.conversationId ?? null,
      })

      return { value }
    }
    finally {
      masterKey.fill(0)
    }
  },
})
