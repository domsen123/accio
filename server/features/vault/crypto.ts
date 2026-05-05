import { Buffer } from 'node:buffer'
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes, timingSafeEqual } from 'node:crypto'
import * as argon2 from 'argon2'

/**
 * Vault cryptography (DESIGN-VAULT-CRYPTO, ADR-017).
 *
 * This module is intentionally separate from `server/utils/crypto.ts`
 * (`encryptForOrg`/`decryptForOrg`). The v1 utility uses a single
 * server-side master secret derived from `NUXT_AUTH_SECRET`; the vault
 * uses a per-user master password the server never persists, so the
 * threat model is materially different.
 *
 * Three layers of keys (DESIGN-VAULT-CRYPTO §Components):
 *   1. master_verifier — Argon2id(master_password, master_salt). Used only
 *      to check whether a submitted password is correct.
 *   2. master_key      — Argon2id(master_password, master_kdf_salt). 32-byte
 *      key. Lives in server memory while the vault is unlocked. Never
 *      persisted.
 *   3. workspace DEK   — random 32-byte key per workspace, AES-256-GCM-
 *      wrapped under HKDF(master_key, workspace_salt, "vault-dek-wrap").
 *
 * Argon2id parameters are pinned for the lifetime of the user's vault
 * setup. The `argon2_params` jsonb on `user_vault_credentials` records
 * which params were used so we can raise them in the future without
 * breaking existing verifiers.
 *
 * This module is a pure-function crypto library. It does NOT zero buffers
 * or manage lifetimes — callers (notably the session store, T-V-6) own
 * key-material zeroisation on eviction. Adding `Buffer.fill(0)` here would
 * be surprising and fragile because callers may still hold references.
 */

// Argon2id parameters (DESIGN-VAULT-CRYPTO §KDF parameters). t=3, m=64MB, p=1.
// `argon2`'s `memoryCost` is in KiB, so 64 MB == 65536. Tunable upward as
// hardware improves; raising these requires re-deriving every existing
// verifier and re-wrapping every workspace DEK.
export const ARGON2_PARAMS = {
  type: argon2.argon2id,
  timeCost: 3,
  memoryCost: 64 * 1024,
  parallelism: 1,
  hashLength: 32,
} as const

// Argon2 algorithm version. argon2 v0.44 always emits 0x13 (per RFC 9106)
// and doesn't export a constant for it — pin the value here so the record
// stored on disk is self-describing for future migrations.
const ARGON2_VERSION = 0x13

// Public shape stored alongside each user's verifier. `version` lets us
// detect parameter changes during future migrations; `type` makes a future
// switch to argon2d/i unambiguously detectable.
export const ARGON2_PARAMS_RECORD = {
  type: 'argon2id',
  t: ARGON2_PARAMS.timeCost,
  m: ARGON2_PARAMS.memoryCost,
  p: ARGON2_PARAMS.parallelism,
  version: ARGON2_VERSION,
} as const

export type Argon2ParamsRecord = typeof ARGON2_PARAMS_RECORD

const AES_ALGORITHM = 'aes-256-gcm'
const AES_KEY_LENGTH = 32
const AES_IV_LENGTH = 12
const AES_TAG_LENGTH = 16
const SALT_LENGTH = 16
const HKDF_INFO_DEK_WRAP = Buffer.from('vault-dek-wrap', 'utf8')

export class VaultCryptoError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'VaultCryptoError'
  }
}

export interface AesGcmBlob {
  ct: Buffer
  iv: Buffer
  tag: Buffer
}

export interface WrappedDek {
  wrappedDek: Buffer
  iv: Buffer
  tag: Buffer
}

const toBuffer = (value: string | Buffer): Buffer =>
  typeof value === 'string' ? Buffer.from(value, 'utf8') : value

/** Generate a 16-byte random salt suitable for the verifier or KDF. */
export const generateSalt = (): Buffer => randomBytes(SALT_LENGTH)

/** Generate a fresh 32-byte DEK (per-workspace). */
export const generateDek = (): Buffer => randomBytes(AES_KEY_LENGTH)

// Single underlying primitive. `argon2idVerifier` and `argon2idDeriveKey`
// produce byte-identical output for the same (password, salt); they're
// separate exports for caller intent only. Callers MUST supply different
// salts (`master_salt` for the verifier, `master_kdf_salt` for the master
// key) per DESIGN-VAULT-CRYPTO §Master-password verifier — otherwise
// brute-forcing the verifier directly yields the master key.
const argon2idRaw = async (password: string, salt: Buffer): Promise<Buffer> => {
  if (salt.length !== SALT_LENGTH) {
    throw new VaultCryptoError(`salt must be ${SALT_LENGTH} bytes`)
  }
  return argon2.hash(toBuffer(password), { ...ARGON2_PARAMS, salt, raw: true })
}

/**
 * Derive the master-password verifier. Output is the raw Argon2id hash
 * (32 bytes); compare with `verifyMasterPassword` for constant-time check.
 */
export const argon2idVerifier = (password: string, salt: Buffer): Promise<Buffer> =>
  argon2idRaw(password, salt)

/**
 * Derive a 32-byte symmetric key from the master password. Uses a different
 * salt from the verifier so brute-forcing the verifier doesn't directly
 * yield the master key (DESIGN-VAULT-CRYPTO §Master-password verifier).
 */
export const argon2idDeriveKey = (password: string, salt: Buffer): Promise<Buffer> =>
  argon2idRaw(password, salt)

/**
 * Constant-time check that a submitted password reproduces the stored
 * verifier. Returns `false` on length mismatch; never throws on bad input.
 */
export const verifyMasterPassword = async (
  password: string,
  salt: Buffer,
  storedVerifier: Buffer,
): Promise<boolean> => {
  const candidate = await argon2idVerifier(password, salt)
  if (candidate.length !== storedVerifier.length)
    return false
  return timingSafeEqual(candidate, storedVerifier)
}

export const aesGcmEncrypt = (plaintext: Buffer, key: Buffer): AesGcmBlob => {
  if (key.length !== AES_KEY_LENGTH) {
    throw new VaultCryptoError(`AES key must be ${AES_KEY_LENGTH} bytes`)
  }
  const iv = randomBytes(AES_IV_LENGTH)
  const cipher = createCipheriv(AES_ALGORITHM, key, iv)
  const ct = Buffer.concat([cipher.update(plaintext), cipher.final()])
  const tag = cipher.getAuthTag()
  return { ct, iv, tag }
}

export const aesGcmDecrypt = (blob: AesGcmBlob, key: Buffer): Buffer => {
  if (key.length !== AES_KEY_LENGTH) {
    throw new VaultCryptoError(`AES key must be ${AES_KEY_LENGTH} bytes`)
  }
  if (blob.iv.length !== AES_IV_LENGTH) {
    throw new VaultCryptoError(`IV must be ${AES_IV_LENGTH} bytes`)
  }
  if (blob.tag.length !== AES_TAG_LENGTH) {
    throw new VaultCryptoError(`auth tag must be ${AES_TAG_LENGTH} bytes`)
  }
  const decipher = createDecipheriv(AES_ALGORITHM, key, blob.iv)
  decipher.setAuthTag(blob.tag)
  try {
    return Buffer.concat([decipher.update(blob.ct), decipher.final()])
  }
  catch (cause) {
    throw new VaultCryptoError('Decryption failed: authentication tag mismatch or wrong key', { cause })
  }
}

const deriveWrappingKey = (masterKey: Buffer, workspaceSalt: Buffer): Buffer => {
  if (masterKey.length !== AES_KEY_LENGTH) {
    throw new VaultCryptoError(`master key must be ${AES_KEY_LENGTH} bytes`)
  }
  if (workspaceSalt.length !== SALT_LENGTH) {
    throw new VaultCryptoError(`workspace salt must be ${SALT_LENGTH} bytes`)
  }
  const derived = hkdfSync('sha256', masterKey, workspaceSalt, HKDF_INFO_DEK_WRAP, AES_KEY_LENGTH)
  return Buffer.from(derived)
}

/**
 * Wrap a workspace DEK under the master key. The wrapping key is derived
 * via HKDF so each workspace gets a distinct AES key without re-running
 * Argon2id (DESIGN-VAULT-CRYPTO §Per-workspace DEK).
 */
export const wrapDek = (dek: Buffer, masterKey: Buffer, workspaceSalt: Buffer): WrappedDek => {
  if (dek.length !== AES_KEY_LENGTH) {
    throw new VaultCryptoError(`DEK must be ${AES_KEY_LENGTH} bytes`)
  }
  const key = deriveWrappingKey(masterKey, workspaceSalt)
  const { ct, iv, tag } = aesGcmEncrypt(dek, key)
  return { wrappedDek: ct, iv, tag }
}

export const unwrapDek = (wrapped: WrappedDek, masterKey: Buffer, workspaceSalt: Buffer): Buffer => {
  const key = deriveWrappingKey(masterKey, workspaceSalt)
  return aesGcmDecrypt({ ct: wrapped.wrappedDek, iv: wrapped.iv, tag: wrapped.tag }, key)
}
