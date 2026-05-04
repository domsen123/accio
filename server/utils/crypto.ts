import { Buffer } from 'node:buffer'
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto'

import config from './config'

/**
 * Per-organisation symmetric encryption (AES-256-GCM).
 *
 * Implements DESIGN-CRYPTO:
 *  - Algorithm: AES-256-GCM
 *  - Key derivation: HKDF-SHA256 from `NUXT_AUTH_SECRET` + per-org `crypto_salt`
 *  - IV: 12 random bytes per encryption call
 *  - Output blob: base64 of `<iv> || <tag> || <ciphertext>` joined with ":" (each part base64)
 *
 * Used by GitHub PAT and AI provider credential storage; the same scheme works
 * for any future per-workspace secret.
 */

const ALGORITHM = 'aes-256-gcm'
const KEY_LENGTH = 32 // 256 bits
const IV_LENGTH = 12 // GCM standard
const TAG_LENGTH = 16 // GCM standard
const HKDF_INFO = Buffer.from('accio:org-secret:v1', 'utf8')

export class EncryptionError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'EncryptionError'
  }
}

const getMasterSecret = (): Buffer => {
  const secret = config.security.auth_secret
  if (!secret) {
    throw new EncryptionError('NUXT_AUTH_SECRET is not configured')
  }
  return Buffer.from(secret, 'utf8')
}

const deriveOrgKey = (orgSalt: string): Buffer => {
  if (!orgSalt) {
    throw new EncryptionError('orgSalt must be a non-empty string')
  }
  const ikm = getMasterSecret()
  const salt = Buffer.from(orgSalt, 'utf8')
  // hkdfSync returns ArrayBuffer — wrap it in a Node Buffer for the cipher API.
  const derived = hkdfSync('sha256', ikm, salt, HKDF_INFO, KEY_LENGTH)
  return Buffer.from(derived)
}

export const encryptForOrg = (plaintext: string, orgSalt: string): string => {
  const key = deriveOrgKey(orgSalt)
  const iv = randomBytes(IV_LENGTH)

  const cipher = createCipheriv(ALGORITHM, key, iv)
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()

  return [
    iv.toString('base64'),
    tag.toString('base64'),
    ciphertext.toString('base64'),
  ].join(':')
}

export const decryptForOrg = (blob: string, orgSalt: string): string => {
  const parts = blob.split(':')
  if (parts.length !== 3 || !parts[0] || !parts[1] || parts[2] === undefined) {
    throw new EncryptionError('Malformed ciphertext: expected <iv>:<tag>:<ciphertext>')
  }

  const iv = Buffer.from(parts[0], 'base64')
  const tag = Buffer.from(parts[1], 'base64')
  const ciphertext = Buffer.from(parts[2], 'base64')

  if (iv.length !== IV_LENGTH) {
    throw new EncryptionError(`Malformed ciphertext: IV must be ${IV_LENGTH} bytes`)
  }
  if (tag.length !== TAG_LENGTH) {
    throw new EncryptionError(`Malformed ciphertext: auth tag must be ${TAG_LENGTH} bytes`)
  }

  const key = deriveOrgKey(orgSalt)
  const decipher = createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(tag)

  try {
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()])
    return plaintext.toString('utf8')
  }
  catch (cause) {
    throw new EncryptionError('Decryption failed: authentication tag mismatch or wrong key', { cause })
  }
}
