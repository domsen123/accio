import { describe, expect, it, vi } from 'vitest'

import {
  redactErrorForLog,
  redactSecrets,
} from '../server/features/vault/redact'

describe('redactSecrets', () => {
  it('redacts secret-bearing field values structurally', () => {
    const input = {
      title: 'GitHub',
      payload: {
        username: 'alice',
        password: 'hunter2',
        url: 'https://example.com',
        notes: 'admin',
        customFields: [
          { name: 'token', isSecret: true, value: 't0p-s3cr3t' },
          { name: 'host', isSecret: false, value: 'ssh.example.com' },
        ],
      },
    }
    const out = redactSecrets(input)
    const json = JSON.stringify(out)
    expect(json).not.toContain('hunter2')
    expect(json).not.toContain('t0p-s3cr3t')
    expect(json).not.toContain('admin') // `notes` is a secret field
    // Non-secret fields and field NAMES survive.
    expect(json).toContain('"title":"GitHub"')
    expect(json).toContain('"username":"alice"')
    expect(json).toContain('"name":"host"')
    // Per the rule, custom_fields[].value is redacted regardless of
    // is_secret because we can't distinguish at the structural level
    // without per-call context. (Documented limitation; safe-by-default.)
    expect(json).not.toContain('ssh.example.com')
  })

  it('walks arrays and nested objects', () => {
    const input = {
      items: [
        { secret: 'a', name: 'one' },
        { token: 'b', name: 'two' },
      ],
    }
    const out = redactSecrets(input) as { items: Array<{ secret?: string, token?: string, name: string }> }
    expect(out.items[0].secret).toBe('<redacted>')
    expect(out.items[1].token).toBe('<redacted>')
    expect(out.items[0].name).toBe('one')
    expect(out.items[1].name).toBe('two')
  })

  it('passes through primitives', () => {
    expect(redactSecrets('hello')).toBe('hello')
    expect(redactSecrets(42)).toBe(42)
    expect(redactSecrets(null)).toBe(null)
    expect(redactSecrets(undefined)).toBe(undefined)
  })

  it('redacts the wrapped-DEK ciphertext components', () => {
    const input = {
      organisationId: 'org_x',
      wrappedDek: 'BBBBciphertextBBBB',
      wrapIv: 'iv-bytes',
      wrapTag: 'tag-bytes',
    }
    const out = redactSecrets(input) as Record<string, unknown>
    expect(out.organisationId).toBe('org_x')
    expect(out.wrappedDek).toBe('<redacted>')
    expect(out.wrapIv).toBe('<redacted>')
    expect(out.wrapTag).toBe('<redacted>')
  })
})

describe('redactErrorForLog', () => {
  it('replaces the error message with a fixed marker', () => {
    const err = new Error('master password hunter2 is wrong')
    const out = redactErrorForLog(err)
    expect(out.message).toBe('<vault error: redacted>')
    expect(out.name).toBe('Error')
    // Stack is kept (it doesn't carry user input typically).
    expect(out.stack).toBeDefined()
  })

  it('redacts non-Error throws as well', () => {
    const out = redactErrorForLog('hunter2 leaked here')
    expect(out.message).toBe('<vault error: redacted>')
    expect(out.name).toBe('NonError')
  })
})

describe('logging hygiene end-to-end (no plaintext reaches the logger)', () => {
  it('a code path that catches a vault error and logs it via redactErrorForLog never emits the plaintext', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    try {
      // Imagine a route caught a thrown error after seeing a master
      // password. The contract: NEVER pass the raw error to the logger;
      // always redact first.
      const masterPassword = 'super-secret-12345'
      const err = new Error(`bad password ${masterPassword}`)
      const safe = redactErrorForLog(err)
      console.error('vault.unlock.failed', safe)
      const logged = consoleSpy.mock.calls.flat().map(arg => JSON.stringify(arg ?? null)).join(' ')
      expect(logged).not.toContain(masterPassword)
    }
    finally {
      consoleSpy.mockRestore()
    }
  })

  it('redactSecrets prevents plaintext leak when serialising a request body for logging', () => {
    const body = {
      currentPassword: 'old-12345',
      newPassword: 'new-67890',
    }
    const safe = redactSecrets(body)
    const logged = JSON.stringify(safe)
    expect(logged).not.toContain('old-12345')
    expect(logged).not.toContain('new-67890')
    // Field names survive so the operator can see what was attempted.
    expect(logged).toContain('currentPassword')
    expect(logged).toContain('newPassword')
  })
})
