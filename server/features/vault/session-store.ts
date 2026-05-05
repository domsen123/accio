import type { Buffer } from 'node:buffer'

/**
 * In-memory vault session store (DESIGN-VAULT-SESSION).
 *
 * The unlocked state of a vault is represented by a `VaultSession` whose
 * master key lives only in this map. The store has three responsibilities:
 *
 *   1. Hold the master key for the lifetime of an unlocked session, scoped
 *      by `(userId, sessionId)`. Different browser sessions for the same
 *      user must each unlock independently.
 *   2. Auto-evict idle sessions on a configurable inactivity timeout
 *      (default 30 minutes per REQ-VAULT-4).
 *   3. Zero the master-key buffer on every eviction path — auto, manual,
 *      logout — before the entry is removed from the map.
 *
 * This is per-process state. If the app ever runs behind multiple Node
 * workers, sessions stop being shared and the store needs an external
 * backend (DESIGN-VAULT-SESSION §Multi-instance note).
 *
 * **Caller note for async crypto.** `getSession` returns the live
 * `Buffer` reference; the sweeper may zero it under the caller's feet on
 * the next event-loop turn if the session expires. Callers that perform
 * `await` work between fetching the session and using the master key
 * MUST copy it first (`Buffer.from(session.masterKey)`) — or finish the
 * crypto synchronously after the lookup.
 */

export interface VaultSession {
  userId: string
  sessionId: string
  masterKey: Buffer
  unlockedAt: Date
  lastActivityAt: Date
}

export interface SessionStoreConfig {
  /** Idle timeout in milliseconds. Default 30 minutes. */
  inactivityMs: number
  /** Sweep interval in milliseconds. Default 60 seconds. */
  sweepIntervalMs: number
}

export const DEFAULT_SESSION_STORE_CONFIG: SessionStoreConfig = {
  inactivityMs: 30 * 60 * 1000,
  sweepIntervalMs: 60 * 1000,
}

const sessionKey = (userId: string, sessionId: string): string =>
  `${userId}:${sessionId}`

export interface VaultSessionStore {
  /** Insert (or replace) a session. Replaces zero the existing master key. */
  createSession: (input: {
    userId: string
    sessionId: string
    masterKey: Buffer
    now?: Date
  }) => VaultSession
  /**
   * Look up a session and (by default) mark it active. Returns null for
   * missing or already-expired sessions. Pass `touch: false` to inspect
   * without extending the timer.
   */
  getSession: (
    userId: string,
    sessionId: string,
    options?: { touch?: boolean, now?: Date },
  ) => VaultSession | null
  /** Remove a single session and zero its master key. */
  evictSession: (userId: string, sessionId: string) => void
  /** Remove every session belonging to a user; called on logout / change-master. */
  evictByUser: (userId: string) => void
  /** Sweep all sessions whose `lastActivityAt` is older than the inactivity threshold. */
  sweep: (now?: Date) => number
  /** Start the periodic sweep interval. Idempotent. */
  start: () => void
  /** Stop the periodic sweep interval and zero every remaining key. */
  stop: () => void
  /** For diagnostics/tests. Excludes already-expired entries (sweep first if you care). */
  size: () => number
}

const zeroBuffer = (buf: Buffer): void => {
  buf.fill(0)
}

export const createVaultSessionStore = (
  config: SessionStoreConfig = DEFAULT_SESSION_STORE_CONFIG,
): VaultSessionStore => {
  const sessions = new Map<string, VaultSession>()
  let timer: NodeJS.Timeout | null = null

  const evictKey = (key: string): void => {
    const session = sessions.get(key)
    if (!session)
      return
    zeroBuffer(session.masterKey)
    sessions.delete(key)
  }

  const sweep: VaultSessionStore['sweep'] = (now = new Date()) => {
    let evicted = 0
    const cutoff = now.getTime() - config.inactivityMs
    for (const [key, session] of sessions) {
      if (session.lastActivityAt.getTime() <= cutoff) {
        evictKey(key)
        evicted += 1
      }
    }
    return evicted
  }

  return {
    createSession: ({ userId, sessionId, masterKey, now = new Date() }) => {
      const key = sessionKey(userId, sessionId)
      // If a session already exists (e.g. user re-unlocked in the same tab),
      // wipe the previous master key before replacing it.
      evictKey(key)
      const session: VaultSession = {
        userId,
        sessionId,
        masterKey,
        unlockedAt: now,
        lastActivityAt: now,
      }
      sessions.set(key, session)
      return session
    },

    getSession: (userId, sessionId, options = {}) => {
      const { touch = true, now = new Date() } = options
      const key = sessionKey(userId, sessionId)
      const session = sessions.get(key)
      if (!session)
        return null
      const cutoff = now.getTime() - config.inactivityMs
      if (session.lastActivityAt.getTime() <= cutoff) {
        evictKey(key)
        return null
      }
      if (touch)
        session.lastActivityAt = now
      return session
    },

    evictSession: (userId, sessionId) => {
      evictKey(sessionKey(userId, sessionId))
    },

    evictByUser: (userId) => {
      const prefix = `${userId}:`
      for (const key of sessions.keys()) {
        if (key.startsWith(prefix))
          evictKey(key)
      }
    },

    sweep,

    start: () => {
      if (timer)
        return
      timer = setInterval(() => sweep(), config.sweepIntervalMs)
      // Don't keep the event loop alive for the timer alone (Nitro shuts
      // down cleanly even if it forgets to call stop()).
      timer.unref?.()
    },

    stop: () => {
      // Zero before clearing so a still-pending sweep tick (defensive: it
      // can't preempt sync code today) sees an empty map.
      for (const key of [...sessions.keys()])
        evictKey(key)
      if (timer) {
        clearInterval(timer)
        timer = null
      }
    },

    size: () => sessions.size,
  }
}
