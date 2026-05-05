/**
 * In-memory sliding-window rate limiter for vault unlock attempts
 * (REQ-VAULT-3). Per-process; if the app ever scales horizontally
 * each worker enforces the limit independently — acceptable for the
 * threat model since each browser session is pinned to one process
 * by sticky sessions or the limit is just stricter, never looser.
 *
 * Not registered in the DI container: the limiter is module-level
 * singleton state, identical to a `Map`, and has no test seam needs
 * beyond the exported factory.
 */

export interface RateLimiterConfig {
  limit: number
  windowMs: number
}

export interface RateLimitResult {
  allowed: boolean
  retryAfterMs?: number
}

export interface RateLimiter {
  checkAndRecord: (key: string) => RateLimitResult
}

export const createRateLimiter = ({ limit, windowMs }: RateLimiterConfig): RateLimiter => {
  const hits = new Map<string, number[]>()

  return {
    checkAndRecord: (key) => {
      const now = Date.now()
      const cutoff = now - windowMs
      const recent = (hits.get(key) ?? []).filter(t => t > cutoff)

      if (recent.length >= limit) {
        const oldest = recent[0]!
        hits.set(key, recent)
        return { allowed: false, retryAfterMs: oldest + windowMs - now }
      }

      recent.push(now)
      hits.set(key, recent)
      return { allowed: true }
    },
  }
}

export const vaultUnlockRateLimiter = createRateLimiter({ limit: 5, windowMs: 60_000 })
