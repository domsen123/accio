/**
 * POST /api/vault/lock — manually lock the vault for the current session
 * (T-V-10, REQ-VAULT-4).
 *
 * Idempotent: locking an already-locked vault is a no-op (no 404). The
 * session store's `evictSession` zeros the master-key buffer if a session
 * existed.
 */
import { container } from '~~/server/utils/container'

export default defineEventHandler((event) => {
  const user = event.context.user
  const session = event.context.session
  if (!user || !session) {
    throw createError({ statusCode: 401, statusMessage: 'auth.unauthenticated' })
  }

  container.vaultSessionStore.evictSession(user.id, session.id)

  return { ok: true }
})
