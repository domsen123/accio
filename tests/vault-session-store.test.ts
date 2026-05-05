import { Buffer } from 'node:buffer'

import { describe, expect, it } from 'vitest'

import { createVaultSessionStore } from '../server/features/vault/session-store'

const makeKey = (fill: number = 0xAA): Buffer => Buffer.alloc(32, fill)

const userId = 'user_01'
const sessionId = 'sess_01'

describe('vault session-store: create / get', () => {
  it('createSession returns a session reachable via getSession', () => {
    const store = createVaultSessionStore({ inactivityMs: 60_000, sweepIntervalMs: 1000 })
    const masterKey = makeKey()
    const created = store.createSession({ userId, sessionId, masterKey })
    expect(created.userId).toBe(userId)
    expect(created.sessionId).toBe(sessionId)
    expect(created.masterKey.equals(masterKey)).toBe(true)
    expect(store.getSession(userId, sessionId)).toBe(created)
  })

  it('getSession returns null for unknown sessions', () => {
    const store = createVaultSessionStore()
    expect(store.getSession('nope', 'nope')).toBeNull()
  })

  it('getSession touches lastActivityAt by default', () => {
    const store = createVaultSessionStore({ inactivityMs: 60_000, sweepIntervalMs: 1000 })
    const t0 = new Date('2026-01-01T00:00:00Z')
    const t1 = new Date('2026-01-01T00:00:30Z')
    store.createSession({ userId, sessionId, masterKey: makeKey(), now: t0 })
    const fetched = store.getSession(userId, sessionId, { now: t1 })
    expect(fetched?.lastActivityAt.toISOString()).toBe(t1.toISOString())
  })

  it('getSession with touch=false leaves lastActivityAt intact', () => {
    const store = createVaultSessionStore({ inactivityMs: 60_000, sweepIntervalMs: 1000 })
    const t0 = new Date('2026-01-01T00:00:00Z')
    const t1 = new Date('2026-01-01T00:00:30Z')
    store.createSession({ userId, sessionId, masterKey: makeKey(), now: t0 })
    const fetched = store.getSession(userId, sessionId, { now: t1, touch: false })
    expect(fetched?.lastActivityAt.toISOString()).toBe(t0.toISOString())
  })

  it('createSession replacing an existing session zeros the old master key', () => {
    const store = createVaultSessionStore()
    const oldKey = makeKey(0xAA)
    const newKey = makeKey(0xBB)
    store.createSession({ userId, sessionId, masterKey: oldKey })
    store.createSession({ userId, sessionId, masterKey: newKey })
    expect(oldKey.every(byte => byte === 0)).toBe(true)
    const session = store.getSession(userId, sessionId)
    expect(session?.masterKey.equals(newKey)).toBe(true)
  })
})

describe('vault session-store: explicit eviction', () => {
  it('evictSession zeros the master key buffer', () => {
    const store = createVaultSessionStore()
    const masterKey = makeKey()
    store.createSession({ userId, sessionId, masterKey })
    store.evictSession(userId, sessionId)
    expect(masterKey.every(byte => byte === 0)).toBe(true)
    expect(store.getSession(userId, sessionId)).toBeNull()
  })

  it('evictSession is a no-op for unknown sessions', () => {
    const store = createVaultSessionStore()
    expect(() => store.evictSession('nope', 'nope')).not.toThrow()
  })

  it('evictByUser drops every session for that user only', () => {
    const store = createVaultSessionStore()
    const userAKey1 = makeKey(0x11)
    const userAKey2 = makeKey(0x22)
    const userBKey = makeKey(0x33)
    store.createSession({ userId: 'A', sessionId: 's1', masterKey: userAKey1 })
    store.createSession({ userId: 'A', sessionId: 's2', masterKey: userAKey2 })
    store.createSession({ userId: 'B', sessionId: 's1', masterKey: userBKey })

    store.evictByUser('A')

    expect(store.getSession('A', 's1')).toBeNull()
    expect(store.getSession('A', 's2')).toBeNull()
    expect(store.getSession('B', 's1')).not.toBeNull()
    expect(userAKey1.every(byte => byte === 0)).toBe(true)
    expect(userAKey2.every(byte => byte === 0)).toBe(true)
    expect(userBKey.equals(makeKey(0x33))).toBe(true)
  })
})

describe('vault session-store: auto-eviction', () => {
  it('sweep evicts sessions older than the inactivity timeout', () => {
    const store = createVaultSessionStore({ inactivityMs: 1000, sweepIntervalMs: 60_000 })
    const t0 = new Date('2026-01-01T00:00:00Z')
    const tFresh = new Date('2026-01-01T00:00:00.500Z')
    const tStale = new Date('2026-01-01T00:00:02Z')

    const masterKey = makeKey()
    store.createSession({ userId, sessionId, masterKey, now: t0 })

    expect(store.sweep(tFresh)).toBe(0)
    expect(store.size()).toBe(1)

    expect(store.sweep(tStale)).toBe(1)
    expect(store.size()).toBe(0)
    expect(masterKey.every(byte => byte === 0)).toBe(true)
  })

  it('getSession returns null for an expired session and zeros the key', () => {
    const store = createVaultSessionStore({ inactivityMs: 1000, sweepIntervalMs: 60_000 })
    const t0 = new Date('2026-01-01T00:00:00Z')
    const tStale = new Date('2026-01-01T00:00:02Z')

    const masterKey = makeKey()
    store.createSession({ userId, sessionId, masterKey, now: t0 })
    expect(store.getSession(userId, sessionId, { now: tStale })).toBeNull()
    expect(masterKey.every(byte => byte === 0)).toBe(true)
  })

  it('activity (touch) extends the timer', () => {
    const store = createVaultSessionStore({ inactivityMs: 1000, sweepIntervalMs: 60_000 })
    const t0 = new Date('2026-01-01T00:00:00Z')
    const t1 = new Date('2026-01-01T00:00:00.500Z')
    const t2 = new Date('2026-01-01T00:00:01.250Z') // would be stale relative to t0
    const t3 = new Date('2026-01-01T00:00:02.500Z') // stale relative to t1

    store.createSession({ userId, sessionId, masterKey: makeKey(), now: t0 })
    // touch at t1 keeps it alive past t2
    expect(store.getSession(userId, sessionId, { now: t1 })).not.toBeNull()
    expect(store.getSession(userId, sessionId, { now: t2 })).not.toBeNull()
    // but staying idle until t3 evicts it
    expect(store.getSession(userId, sessionId, { now: t3 })).toBeNull()
  })

  it('start runs the periodic sweep timer (idempotent), stop clears it', async () => {
    const store = createVaultSessionStore({ inactivityMs: 5, sweepIntervalMs: 10 })
    store.createSession({ userId, sessionId, masterKey: makeKey() })
    store.start()
    store.start() // idempotent
    await new Promise(resolve => setTimeout(resolve, 50))
    expect(store.size()).toBe(0)
    store.stop()
  })

  it('stop zeros every remaining master key', () => {
    const store = createVaultSessionStore()
    const a = makeKey(0xAA)
    const b = makeKey(0xBB)
    store.createSession({ userId: 'A', sessionId: 's', masterKey: a })
    store.createSession({ userId: 'B', sessionId: 's', masterKey: b })
    store.stop()
    expect(a.every(byte => byte === 0)).toBe(true)
    expect(b.every(byte => byte === 0)).toBe(true)
    expect(store.size()).toBe(0)
  })
})
