/**
 * POST /api/vault/setup — first-time master-password setup (T-V-7, REQ-VAULT-1).
 *
 * Stores only an Argon2id verifier; the master password itself is never
 * persisted. Idempotent: a second call for the same user returns 409.
 */
import bcrypt from 'bcrypt'
import { z } from 'zod'
import { ARGON2_PARAMS_RECORD, argon2idVerifier, generateSalt } from '~~/server/features/vault/crypto'
import { container } from '~~/server/utils/container'

const setupSchema = z.object({
  masterPassword: z.string().trim().min(12),
  acknowledgeIrrecoverable: z.literal(true),
})

export default defineEventHandler(async (event) => {
  if (!event.context.user) {
    throw createError({ statusCode: 401, statusMessage: 'auth.unauthenticated' })
  }

  const { masterPassword } = await readValidatedBody(event, body => setupSchema.parse(body))
  const userId = event.context.user.id

  const user = await container.items.users.findOne({ id: userId })
  if (user?.passwordHash && await bcrypt.compare(masterPassword, user.passwordHash)) {
    throw createError({ statusCode: 400, statusMessage: 'vault.setup.equals_login_password' })
  }

  const existing = await container.items.userVaultCredentials.findOne({ userId })
  if (existing) {
    throw createError({ statusCode: 409, statusMessage: 'vault.setup.already_configured' })
  }

  const masterSalt = generateSalt()
  const masterKdfSalt = generateSalt()
  const masterVerifier = await argon2idVerifier(masterPassword, masterSalt)

  await container.items.userVaultCredentials.create({
    userId,
    masterSalt,
    masterVerifier,
    masterKdfSalt,
    argon2Params: ARGON2_PARAMS_RECORD,
  })

  return { ok: true }
})
