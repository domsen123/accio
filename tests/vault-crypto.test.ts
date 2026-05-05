import { Buffer } from 'node:buffer'

import { describe, expect, it } from 'vitest'

import {
  aesGcmDecrypt,
  aesGcmEncrypt,
  ARGON2_PARAMS_RECORD,
  argon2idDeriveKey,
  argon2idVerifier,
  generateDek,
  generateSalt,
  unwrapDek,
  VaultCryptoError,
  verifyMasterPassword,
  wrapDek,
} from '../server/features/vault/crypto'

const KNOWN_PASSWORD = 'correct horse battery staple — Schöne Grüße'
const WRONG_PASSWORD = 'something else entirely'

describe('vault crypto: argon2id', () => {
  it('exposes the parameters used (for argon2_params jsonb)', () => {
    expect(ARGON2_PARAMS_RECORD.type).toBe('argon2id')
    expect(ARGON2_PARAMS_RECORD.t).toBe(3)
    expect(ARGON2_PARAMS_RECORD.m).toBe(64 * 1024)
    expect(ARGON2_PARAMS_RECORD.p).toBe(1)
    expect(typeof ARGON2_PARAMS_RECORD.version).toBe('number')
  })

  it('verifier and derive-key share the same primitive (lock-in invariant)', async () => {
    // Today both exports call the same Argon2id with the same params;
    // this test enforces the invariant so a future divergence is deliberate.
    const salt = generateSalt()
    const verifier = await argon2idVerifier(KNOWN_PASSWORD, salt)
    const key = await argon2idDeriveKey(KNOWN_PASSWORD, salt)
    expect(verifier.equals(key)).toBe(true)
  })

  it('produces deterministic verifier for the same password+salt', async () => {
    const salt = generateSalt()
    const a = await argon2idVerifier(KNOWN_PASSWORD, salt)
    const b = await argon2idVerifier(KNOWN_PASSWORD, salt)
    expect(a.equals(b)).toBe(true)
    expect(a.length).toBe(32)
  })

  it('produces a different verifier when the salt changes', async () => {
    const a = await argon2idVerifier(KNOWN_PASSWORD, generateSalt())
    const b = await argon2idVerifier(KNOWN_PASSWORD, generateSalt())
    expect(a.equals(b)).toBe(false)
  })

  it('produces a different output for verifier vs. derive-key salts', async () => {
    // Real-world: master_salt and master_kdf_salt are independent random salts
    // so brute-forcing the verifier doesn't directly yield the master key.
    const verifierSalt = generateSalt()
    const kdfSalt = generateSalt()
    const verifier = await argon2idVerifier(KNOWN_PASSWORD, verifierSalt)
    const key = await argon2idDeriveKey(KNOWN_PASSWORD, kdfSalt)
    expect(verifier.equals(key)).toBe(false)
    expect(key.length).toBe(32)
  })

  it('rejects salts of the wrong length', async () => {
    await expect(argon2idVerifier('x', Buffer.alloc(8))).rejects.toThrow(VaultCryptoError)
    await expect(argon2idDeriveKey('x', Buffer.alloc(32))).rejects.toThrow(VaultCryptoError)
  })

  it('verifyMasterPassword returns true for correct password (constant-time)', async () => {
    const salt = generateSalt()
    const stored = await argon2idVerifier(KNOWN_PASSWORD, salt)
    expect(await verifyMasterPassword(KNOWN_PASSWORD, salt, stored)).toBe(true)
  })

  it('verifyMasterPassword returns false for wrong password (no throw)', async () => {
    const salt = generateSalt()
    const stored = await argon2idVerifier(KNOWN_PASSWORD, salt)
    expect(await verifyMasterPassword(WRONG_PASSWORD, salt, stored)).toBe(false)
  })

  it('verifyMasterPassword returns false on length mismatch (no throw)', async () => {
    const salt = generateSalt()
    expect(await verifyMasterPassword(KNOWN_PASSWORD, salt, Buffer.alloc(8))).toBe(false)
  })
})

describe('vault crypto: AES-256-GCM round-trip', () => {
  it('encrypts and decrypts arbitrary plaintexts', () => {
    const key = generateDek()
    const samples = [
      Buffer.from(''),
      Buffer.from('hello'),
      Buffer.from('Schöne Grüße aus München — emoji 🦊'),
      Buffer.from('x'.repeat(4096)),
      Buffer.from([0, 1, 2, 3, 0xFF, 0xFE]), // raw bytes
    ]
    for (const plaintext of samples) {
      const blob = aesGcmEncrypt(plaintext, key)
      expect(blob.iv.length).toBe(12)
      expect(blob.tag.length).toBe(16)
      const out = aesGcmDecrypt(blob, key)
      expect(out.equals(plaintext)).toBe(true)
    }
  })

  it('produces a different IV/ciphertext on each call', () => {
    const key = generateDek()
    const a = aesGcmEncrypt(Buffer.from('same'), key)
    const b = aesGcmEncrypt(Buffer.from('same'), key)
    expect(a.iv.equals(b.iv)).toBe(false)
    expect(a.ct.equals(b.ct)).toBe(false)
  })

  it('detects tampering with the ciphertext', () => {
    const key = generateDek()
    const blob = aesGcmEncrypt(Buffer.from('top secret'), key)
    const tampered = { ...blob, ct: Buffer.from(blob.ct) }
    tampered.ct[0] = (tampered.ct[0] ?? 0) ^ 0x01
    expect(() => aesGcmDecrypt(tampered, key)).toThrow(VaultCryptoError)
  })

  it('detects tampering with the auth tag', () => {
    const key = generateDek()
    const blob = aesGcmEncrypt(Buffer.from('top secret'), key)
    const tampered = { ...blob, tag: Buffer.from(blob.tag) }
    tampered.tag[0] = (tampered.tag[0] ?? 0) ^ 0x01
    expect(() => aesGcmDecrypt(tampered, key)).toThrow(VaultCryptoError)
  })

  it('rejects keys of the wrong length', () => {
    expect(() => aesGcmEncrypt(Buffer.from('x'), Buffer.alloc(16))).toThrow(VaultCryptoError)
    expect(() => aesGcmDecrypt(
      { ct: Buffer.alloc(0), iv: Buffer.alloc(12), tag: Buffer.alloc(16) },
      Buffer.alloc(16),
    )).toThrow(VaultCryptoError)
  })

  it('rejects malformed IV/tag lengths in decrypt', () => {
    const key = generateDek()
    const ok = aesGcmEncrypt(Buffer.from('x'), key)
    expect(() => aesGcmDecrypt({ ...ok, iv: Buffer.alloc(8) }, key)).toThrow(VaultCryptoError)
    expect(() => aesGcmDecrypt({ ...ok, tag: Buffer.alloc(8) }, key)).toThrow(VaultCryptoError)
  })

  it('cannot decrypt with a different key', () => {
    const blob = aesGcmEncrypt(Buffer.from('protected'), generateDek())
    expect(() => aesGcmDecrypt(blob, generateDek())).toThrow(VaultCryptoError)
  })
})

describe('vault crypto: DEK wrap/unwrap', () => {
  it('round-trips a DEK with a known master password', async () => {
    const masterKey = await argon2idDeriveKey(KNOWN_PASSWORD, generateSalt())
    const workspaceSalt = generateSalt()
    const dek = generateDek()

    const wrapped = wrapDek(dek, masterKey, workspaceSalt)
    expect(wrapped.iv.length).toBe(12)
    expect(wrapped.tag.length).toBe(16)
    expect(wrapped.wrappedDek.length).toBe(dek.length)

    const unwrapped = unwrapDek(wrapped, masterKey, workspaceSalt)
    expect(unwrapped.equals(dek)).toBe(true)
  })

  it('cannot unwrap with the wrong master key (wrong-password detection)', async () => {
    const goodKey = await argon2idDeriveKey(KNOWN_PASSWORD, generateSalt())
    const badKey = await argon2idDeriveKey(WRONG_PASSWORD, generateSalt())
    const workspaceSalt = generateSalt()

    const wrapped = wrapDek(generateDek(), goodKey, workspaceSalt)
    expect(() => unwrapDek(wrapped, badKey, workspaceSalt)).toThrow(VaultCryptoError)
  })

  it('cannot unwrap with the wrong workspace salt (workspace isolation)', async () => {
    const masterKey = await argon2idDeriveKey(KNOWN_PASSWORD, generateSalt())
    const wrapped = wrapDek(generateDek(), masterKey, generateSalt())
    expect(() => unwrapDek(wrapped, masterKey, generateSalt())).toThrow(VaultCryptoError)
  })

  it('produces different wrappings each call (fresh IV)', async () => {
    const masterKey = await argon2idDeriveKey(KNOWN_PASSWORD, generateSalt())
    const workspaceSalt = generateSalt()
    const dek = generateDek()
    const a = wrapDek(dek, masterKey, workspaceSalt)
    const b = wrapDek(dek, masterKey, workspaceSalt)
    expect(a.iv.equals(b.iv)).toBe(false)
    expect(a.wrappedDek.equals(b.wrappedDek)).toBe(false)
    // Both still unwrap to the same DEK.
    expect(unwrapDek(a, masterKey, workspaceSalt).equals(dek)).toBe(true)
    expect(unwrapDek(b, masterKey, workspaceSalt).equals(dek)).toBe(true)
  })

  it('detects tampering of the wrapped DEK', async () => {
    const masterKey = await argon2idDeriveKey(KNOWN_PASSWORD, generateSalt())
    const workspaceSalt = generateSalt()
    const wrapped = wrapDek(generateDek(), masterKey, workspaceSalt)
    const tampered = { ...wrapped, wrappedDek: Buffer.from(wrapped.wrappedDek) }
    tampered.wrappedDek[0] = (tampered.wrappedDek[0] ?? 0) ^ 0x01
    expect(() => unwrapDek(tampered, masterKey, workspaceSalt)).toThrow(VaultCryptoError)
  })

  it('rejects DEKs of the wrong length', async () => {
    const masterKey = await argon2idDeriveKey(KNOWN_PASSWORD, generateSalt())
    expect(() => wrapDek(Buffer.alloc(16), masterKey, generateSalt())).toThrow(VaultCryptoError)
  })
})
