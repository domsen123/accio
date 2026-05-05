/**
 * POST /api/vault/change-master — rotate the user's master password
 * (T-V-12, REQ-VAULT-5).
 *
 * Verifies the current master password against the per-user verifier, then
 * for every workspace the user is a member of attempts to unwrap the
 * existing DEK with the old master key and re-wraps it under the new master
 * key, keeping the same `workspace_salt`. Workspace key rows that fail to
 * unwrap (i.e. were wrapped under a *different* user's master key) are
 * silently skipped — they don't belong to this user's wrapping chain.
 *
 * Both the verifier and KDF salts are rotated alongside the verifier itself
 * so a leaked old verifier can't be replayed against the new password.
 *
 * On success we evict every active vault session for this user
 * (REQ-VAULT-5: "WHEN the change succeeds THE SYSTEM SHALL invalidate any
 * other active vault sessions for the same user"). The current request's
 * vault is now locked too — by design, because the master key in memory was
 * derived from the *old* password and would no longer match the persisted
 * credentials.
 */
import type { Buffer } from 'node:buffer'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { userVaultCredentials } from '~~/server/database/schema'
import {
  ARGON2_PARAMS_RECORD,
  argon2idDeriveKey,
  argon2idVerifier,
  generateSalt,
  unwrapDek,
  VaultCryptoError,
  verifyMasterPassword,
  wrapDek,
} from '~~/server/features/vault/crypto'
import { getDatabase } from '~~/server/infrastructure/database/client'
import { container } from '~~/server/utils/container'

const schema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().trim().min(12),
})

export default defineEventHandler(async (event) => {
  const user = event.context.user
  if (!user) {
    throw createError({ statusCode: 401, statusMessage: 'auth.unauthenticated' })
  }

  const { currentPassword, newPassword } = await readValidatedBody(event, body => schema.parse(body))

  if (currentPassword === newPassword) {
    throw createError({ statusCode: 400, statusMessage: 'vault.change_master.unchanged' })
  }

  const creds = await container.items.userVaultCredentials.findOne({ userId: user.id })
  if (!creds) {
    throw createError({ statusCode: 412, statusMessage: 'vault.change_master.master_password_not_set' })
  }

  const ok = await verifyMasterPassword(currentPassword, creds.masterSalt, creds.masterVerifier)
  if (!ok) {
    throw createError({ statusCode: 401, statusMessage: 'vault.change_master.invalid_current' })
  }

  const oldMasterKey = await argon2idDeriveKey(currentPassword, creds.masterKdfSalt)

  const newMasterSalt = generateSalt()
  const newMasterKdfSalt = generateSalt()
  const newMasterVerifier = await argon2idVerifier(newPassword, newMasterSalt)
  const newMasterKey = await argon2idDeriveKey(newPassword, newMasterKdfSalt)

  try {
    const memberships = await container.items.organisationMembers.findMany({
      filter: { userId: user.id },
    })
    const orgIds = memberships.map(m => m.organisationId)

    if (orgIds.length > 0) {
      const keysRows = await container.items.workspaceVaultKeys.findMany({
        filter: { organisationId: { _in: orgIds } },
      })

      for (const row of keysRows) {
        let dek: Buffer | null = null
        try {
          dek = unwrapDek(
            { wrappedDek: row.wrappedDek, iv: row.wrapIv, tag: row.wrapTag },
            oldMasterKey,
            row.workspaceSalt,
          )
        }
        catch (err) {
          if (err instanceof VaultCryptoError) {
            // Wrapped under a different user's master key. Not ours to rotate.
            continue
          }
          throw err
        }

        try {
          const wrapped = wrapDek(dek, newMasterKey, row.workspaceSalt)
          await container.items.workspaceVaultKeys.update(row.id, {
            wrappedDek: wrapped.wrappedDek,
            wrapIv: wrapped.iv,
            wrapTag: wrapped.tag,
          })
        }
        finally {
          dek.fill(0)
        }
      }
    }

    // userVaultCredentials uses `userId` as PK, not `id` — the generic
    // ItemService update path keys on `id`, so go direct via Drizzle here.
    const db = getDatabase('app')
    await db
      .update(userVaultCredentials)
      .set({
        masterSalt: newMasterSalt,
        masterVerifier: newMasterVerifier,
        masterKdfSalt: newMasterKdfSalt,
        argon2Params: ARGON2_PARAMS_RECORD,
        updatedAt: new Date(),
      })
      .where(eq(userVaultCredentials.userId, user.id))

    container.vaultSessionStore.evictByUser(user.id)

    return { ok: true }
  }
  finally {
    oldMasterKey.fill(0)
    newMasterKey.fill(0)
  }
})
