/**
 * POST /api/vault/unlock — verify the master password, derive the master
 * key, and store it in the in-memory vault session store
 * (T-V-9, REQ-VAULT-3, DESIGN-VAULT-CRYPTO §session, DESIGN-VAULT-SESSION).
 *
 * The master password is never logged. The session store takes ownership of
 * the derived master-key buffer; we deliberately do not zero it locally.
 *
 * Order of operations:
 *   1. Auth check (401)
 *   2. Body parse (400 on malformed; doesn't count against rate limit so
 *      garbage-body spam can't waste budget on legitimate users)
 *   3. Credentials lookup — 412 precondition if not set up (UI can route
 *      to setup; doesn't count against rate limit since no password was
 *      attempted)
 *   4. Rate limit (5/min/session) — only counts real attempts
 *   5. Verify password (401 generic on wrong)
 *   6. Derive master key, hand to session store
 */
import { z } from 'zod'
import { argon2idDeriveKey, verifyMasterPassword } from '~~/server/features/vault/crypto'
import { vaultUnlockRateLimiter } from '~~/server/features/vault/rate-limiter'
import { container } from '~~/server/utils/container'

const unlockSchema = z.object({
  masterPassword: z.string().min(1),
})

export default defineEventHandler(async (event) => {
  const user = event.context.user
  const session = event.context.session
  if (!user || !session) {
    throw createError({ statusCode: 401, statusMessage: 'auth.unauthenticated' })
  }

  const { masterPassword } = await readValidatedBody(event, body => unlockSchema.parse(body))

  const creds = await container.items.userVaultCredentials.findOne({ userId: user.id })
  if (!creds) {
    throw createError({ statusCode: 412, statusMessage: 'vault.unlock.master_password_not_set' })
  }

  const rate = vaultUnlockRateLimiter.checkAndRecord(session.id)
  if (!rate.allowed) {
    throw createError({
      statusCode: 429,
      statusMessage: 'vault.unlock.rate_limited',
      data: { retryAfterMs: rate.retryAfterMs },
    })
  }

  const ok = await verifyMasterPassword(masterPassword, creds.masterSalt, creds.masterVerifier)
  if (!ok) {
    throw createError({ statusCode: 401, statusMessage: 'vault.unlock.invalid' })
  }

  const masterKey = await argon2idDeriveKey(masterPassword, creds.masterKdfSalt)
  container.vaultSessionStore.createSession({
    userId: user.id,
    sessionId: session.id,
    masterKey,
  })

  return {
    ok: true,
    locksAt: new Date(Date.now() + container.vaultSessionStore.inactivityMs).toISOString(),
  }
})
