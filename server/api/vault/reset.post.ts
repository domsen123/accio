/**
 * POST /api/vault/reset — wipe a user's vault and start over
 * (T-V-13, REQ-VAULT-6).
 *
 * The reset is the documented escape hatch for a forgotten master
 * password. Hard delete is intentional: soft delete would defeat the
 * purpose because the encrypted blobs would still be there, unreadable
 * forever. The user has acknowledged this is destructive and irreversible
 * in the UI; on the wire we additionally require an explicit
 * `confirm: true` so accidental POSTs don't shred a vault.
 *
 * Scope of deletion (per REQ-VAULT-6 and T-V-13):
 *   - `user_vault_credentials` for the calling user
 *   - For every organisation the user is a member of: hard delete
 *     `workspace_vault_keys`, `vault_entries`, `vault_entry_tags`,
 *     `vault_tags`, `vault_folders`, and `vault_access_log` rows
 *
 * In a multi-user workspace this also wipes other members' vault data —
 * acknowledged limitation. The spec calls "all workspaces for the user"
 * the affected scope; without the master password we can't disambiguate
 * which workspace key rows are wrapped under *this* user's master key,
 * so we err on the side of the user-stated intent ("I want to start
 * over"). Document and accept.
 *
 * Everything runs in one transaction so a failure leaves the DB
 * consistent. Vault sessions for this user are evicted afterwards even
 * if the transaction throws — locking on the way out is always safe.
 */
import { eq, inArray } from 'drizzle-orm'
import { z } from 'zod'
import {
  userVaultCredentials,
  vaultAccessLog,
  vaultEntries,
  vaultEntryTags,
  vaultFolders,
  vaultTags,
  workspaceVaultKeys,
} from '~~/server/database/schema'
import { getDatabase } from '~~/server/infrastructure/database/client'
import { container } from '~~/server/utils/container'

const schema = z.object({
  confirm: z.literal(true),
})

export default defineEventHandler(async (event) => {
  const user = event.context.user
  if (!user) {
    throw createError({ statusCode: 401, statusMessage: 'auth.unauthenticated' })
  }

  await readValidatedBody(event, body => schema.parse(body))

  try {
    const memberships = await container.items.organisationMembers.findMany({
      filter: { userId: user.id },
    })
    const orgIds = memberships.map(m => m.organisationId)

    const db = getDatabase('app')
    await db.transaction(async (tx) => {
      if (orgIds.length > 0) {
        // entry_tags has FKs ON DELETE CASCADE from both sides, but be
        // explicit so the order is independent of FK constraints if those
        // ever change.
        const entries = await tx
          .select({ id: vaultEntries.id })
          .from(vaultEntries)
          .where(inArray(vaultEntries.organisationId, orgIds))
        const entryIds = entries.map(e => e.id)
        if (entryIds.length > 0) {
          await tx.delete(vaultEntryTags).where(inArray(vaultEntryTags.entryId, entryIds))
        }

        await tx.delete(vaultAccessLog).where(inArray(vaultAccessLog.organisationId, orgIds))
        await tx.delete(vaultEntries).where(inArray(vaultEntries.organisationId, orgIds))
        await tx.delete(vaultTags).where(inArray(vaultTags.organisationId, orgIds))
        await tx.delete(vaultFolders).where(inArray(vaultFolders.organisationId, orgIds))
        await tx.delete(workspaceVaultKeys).where(inArray(workspaceVaultKeys.organisationId, orgIds))
      }

      await tx.delete(userVaultCredentials).where(eq(userVaultCredentials.userId, user.id))
    })

    return { ok: true }
  }
  finally {
    container.vaultSessionStore.evictByUser(user.id)
  }
})
