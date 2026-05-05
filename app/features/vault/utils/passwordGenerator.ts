/**
 * Browser-side password generator (T-V-27, REQ-VAULT-20).
 *
 * Uses `crypto.getRandomValues` for the CSPRNG. Excludes obviously
 * confusing characters (0/O, 1/l/I) from each pool by default; the
 * caller can ask for raw pools via `excludeAmbiguous: false` if a use
 * case ever needs them.
 */
const POOLS = {
  lowercase: 'abcdefghijkmnopqrstuvwxyz',
  uppercase: 'ABCDEFGHJKLMNPQRSTUVWXYZ',
  digits: '23456789',
  symbols: '!@#$%^&*()-_=+[]{};:,.<>?',
} as const

const RAW_POOLS = {
  lowercase: 'abcdefghijklmnopqrstuvwxyz',
  uppercase: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  digits: '0123456789',
  symbols: '!@#$%^&*()-_=+[]{};:,.<>?',
} as const

export interface GeneratorOptions {
  length: number
  lowercase: boolean
  uppercase: boolean
  digits: boolean
  symbols: boolean
  excludeAmbiguous?: boolean
}

const cryptoRef = (): Crypto => {
  if (typeof globalThis !== 'undefined' && globalThis.crypto)
    return globalThis.crypto
  throw new Error('Web Crypto API not available')
}

export const generatePassword = (opts: GeneratorOptions): string => {
  const pools = opts.excludeAmbiguous === false ? RAW_POOLS : POOLS
  const enabled: string[] = []
  if (opts.lowercase)
    enabled.push(pools.lowercase)
  if (opts.uppercase)
    enabled.push(pools.uppercase)
  if (opts.digits)
    enabled.push(pools.digits)
  if (opts.symbols)
    enabled.push(pools.symbols)

  if (enabled.length === 0)
    throw new Error('At least one character class must be enabled')

  const charset = enabled.join('')
  const length = Math.max(4, Math.min(128, Math.floor(opts.length)))
  const out: string[] = []
  const buf = new Uint32Array(1)
  const c = cryptoRef()

  // First, guarantee at least one character from every enabled pool — keeps
  // the generated password compliant with the toggles even at small lengths.
  for (const pool of enabled) {
    c.getRandomValues(buf)
    out.push(pool.charAt(buf[0]! % pool.length))
  }

  // Fill the remainder uniformly from the combined charset.
  for (let i = out.length; i < length; i += 1) {
    c.getRandomValues(buf)
    out.push(charset.charAt(buf[0]! % charset.length))
  }

  // Shuffle so the guaranteed-pool characters aren't always at the front
  // (Fisher-Yates with crypto-strong indices).
  for (let i = out.length - 1; i > 0; i -= 1) {
    c.getRandomValues(buf)
    const j = buf[0]! % (i + 1)
    const tmp = out[i]!
    out[i] = out[j]!
    out[j] = tmp
  }

  return out.join('')
}
