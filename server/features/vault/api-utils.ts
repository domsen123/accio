import type { H3Event } from 'h3'
/**
 * Vault API helpers (T-V-16+).
 *
 * `requireVaultUnlocked` is the single seam that vault routes use to assert
 * the in-memory master key is present for the current `(userId, sessionId)`.
 * Routes that decrypt entries call it; routes that only touch metadata
 * (status, lock, setup) do not.
 *
 * The helper returns the live `VaultSession` so the caller can pass
 * `session.masterKey` straight into the service. The session-store
 * docstring (T-V-6) flags that the master-key buffer can be zeroed under
 * the caller's feet by the sweeper if execution awaits long enough; the
 * vault service unwraps the workspace DEK before any further async work
 * so the live reference is consumed synchronously after lookup.
 */
import type { VaultSession } from './session-store'
import { createError } from 'h3'
import { container } from '../../utils/container'

export interface UnlockedVaultContext {
  userId: string
  sessionId: string
  session: VaultSession
}

export const requireVaultUnlocked = (event: H3Event): UnlockedVaultContext => {
  const user = event.context.user
  const session = event.context.session
  if (!user || !session) {
    throw createError({ statusCode: 401, statusMessage: 'auth.unauthenticated' })
  }
  const vaultSession = container.vaultSessionStore.getSession(user.id, session.id)
  if (!vaultSession) {
    // 423 Locked — REQ-VAULT-3, DESIGN-VAULT-API.
    throw createError({ statusCode: 423, statusMessage: 'vault.locked' })
  }
  return { userId: user.id, sessionId: session.id, session: vaultSession }
}
