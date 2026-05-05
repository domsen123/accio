/**
 * GET /api/vault/status — vault state for the current session
 * (T-V-10, REQ-VAULT-4).
 *
 * Returns:
 *   isSetup    — whether the user has run /api/vault/setup
 *   isUnlocked — whether the current session has a master key in memory
 *   locksAt    — ISO8601, present only when unlocked; equals
 *                lastActivityAt + inactivityMs
 *
 * Status reads do NOT extend the inactivity timer (REQ-VAULT-4: only
 * vault API calls that *operate on* secrets count as activity). UIs may
 * poll this endpoint freely.
 *
 * Spec text uses snake_case (`is_setup`, `locks_at`) for these keys; we
 * use camelCase here to match the rest of the API surface (the spec
 * language is descriptive, not prescriptive of casing).
 */
import { container } from '~~/server/utils/container'

export default defineEventHandler(async (event) => {
  const user = event.context.user
  const session = event.context.session
  if (!user || !session) {
    throw createError({ statusCode: 401, statusMessage: 'auth.unauthenticated' })
  }

  const creds = await container.items.userVaultCredentials.findOne({ userId: user.id })
  const isSetup = creds !== null

  const vaultSession = container.vaultSessionStore.getSession(user.id, session.id, { touch: false })
  const isUnlocked = vaultSession !== null

  const locksAt = vaultSession
    ? new Date(vaultSession.lastActivityAt.getTime() + container.vaultSessionStore.inactivityMs).toISOString()
    : undefined

  return {
    isSetup,
    isUnlocked,
    locksAt,
  }
})
