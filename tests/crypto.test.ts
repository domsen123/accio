import { Buffer } from 'node:buffer'
import { randomBytes } from 'node:crypto'

import { describe, expect, it } from 'vitest'

import config from '../server/utils/config'
import { decryptForOrg, encryptForOrg, EncryptionError } from '../server/utils/crypto'

const makeSalt = () => randomBytes(16).toString('hex')

describe('crypto: encryptForOrg / decryptForOrg', () => {
  it('round-trips ASCII, UTF-8, empty, and long plaintexts', () => {
    const salt = makeSalt()
    const samples = [
      '',
      'hello world',
      'ghp_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
      'Schöne Grüße aus München — emoji ok',
      'x'.repeat(4096),
    ]

    for (const plaintext of samples) {
      const blob = encryptForOrg(plaintext, salt)
      expect(decryptForOrg(blob, salt)).toBe(plaintext)
    }
  })

  it('produces a different ciphertext on each call (fresh IV)', () => {
    const salt = makeSalt()
    const plaintext = 'same input, different ivs'

    const a = encryptForOrg(plaintext, salt)
    const b = encryptForOrg(plaintext, salt)

    expect(a).not.toBe(b)
    expect(decryptForOrg(a, salt)).toBe(plaintext)
    expect(decryptForOrg(b, salt)).toBe(plaintext)
  })

  it('detects tampering with the ciphertext (auth-tag mismatch)', () => {
    const salt = makeSalt()
    const blob = encryptForOrg('top secret', salt)

    // Flip a single bit in the ciphertext segment.
    const [iv, tag, ct] = blob.split(':')
    const ctBuf = Buffer.from(ct, 'base64')
    ctBuf[0] ^= 0x01
    const tampered = [iv, tag, ctBuf.toString('base64')].join(':')

    expect(() => decryptForOrg(tampered, salt)).toThrow(EncryptionError)
  })

  it('isolates secrets across orgs (different salt cannot decrypt)', () => {
    const saltA = makeSalt()
    const saltB = makeSalt()
    expect(saltA).not.toBe(saltB)

    const blob = encryptForOrg('org-a only', saltA)
    expect(() => decryptForOrg(blob, saltB)).toThrow(EncryptionError)
  })

  it('rejects malformed blobs with a typed error', () => {
    const salt = makeSalt()
    expect(() => decryptForOrg('not-a-real-blob', salt)).toThrow(EncryptionError)
    expect(() => decryptForOrg('aa:bb', salt)).toThrow(EncryptionError)
    // Three parts but garbage IV length:
    expect(() => decryptForOrg('aa:bb:cc', salt)).toThrow(EncryptionError)
  })

  it('rejects empty orgSalt', () => {
    expect(() => encryptForOrg('x', '')).toThrow(EncryptionError)
    expect(() => decryptForOrg('aa:bb:cc', '')).toThrow(EncryptionError)
  })

  it('cannot decrypt with a different master secret', () => {
    const salt = makeSalt()
    const blob = encryptForOrg('protected', salt)

    const original = config.security.auth_secret
    try {
      config.security.auth_secret = `${original}-tampered`
      expect(() => decryptForOrg(blob, salt)).toThrow(EncryptionError)
    }
    finally {
      config.security.auth_secret = original
    }
  })
})
