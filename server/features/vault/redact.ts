/**
 * Vault logging hygiene (T-V-33, DESIGN-VAULT-LOGGING).
 *
 * Two helpers:
 *   - `redactSecrets(value)` walks an arbitrary structured value and
 *     replaces values at any key whose name contains "password", "secret",
 *     "token", "value" (used by custom-fields), "notes", "masterPassword",
 *     "wrappedDek", or `wrap_*` ciphertext components, with the literal
 *     `'<redacted>'`. Field NAMES are kept (so it's still possible to see
 *     which fields were involved); only the values vanish.
 *   - `redactErrorForLog(err)` returns a shallow copy of the error with
 *     `message` replaced by the literal `<vault error: redacted>`. The
 *     full message is still safe to return to the user — only the LOG
 *     copy is sanitised. Stacks are kept (they don't include user input).
 *
 * The redaction is structural: it does NOT scan free-text strings for
 * secret-looking substrings — that's both unreliable and wastes CPU on
 * the hot path. Callers that emit ad-hoc strings (e.g. interpolating a
 * caught error message into a log line) should call `redactErrorForLog`
 * before stringifying.
 */

const SECRET_KEY_NAMES = new Set([
  'password',
  'currentPassword',
  'newPassword',
  'masterPassword',
  'masterVerifier',
  'masterSalt',
  'masterKdfSalt',
  'secret',
  'token',
  'notes',
  'value',
  'wrappedDek',
  'wrapIv',
  'wrapTag',
  'workspaceSalt',
  'ct',
  'iv',
  'tag',
])

const REDACTED = '<redacted>'

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v) && !(v instanceof Date)

export const redactSecrets = (input: unknown): unknown => {
  if (Array.isArray(input))
    return input.map(redactSecrets)
  if (!isPlainObject(input))
    return input
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(input)) {
    if (SECRET_KEY_NAMES.has(key)) {
      out[key] = REDACTED
      continue
    }
    out[key] = redactSecrets(value)
  }
  return out
}

/**
 * V8 stack traces include the error message verbatim on the first line
 * (`Error: <message>\n    at ...`). Drop the header line, and as a belt-
 * and-braces measure also drop any frames that still contain the
 * original message text (filenames or eval contexts can sometimes
 * inline it). We KEEP the rest of the stack — it's just file paths and
 * line numbers, no user input.
 */
const stripStackHeader = (stack: string | undefined, originalMessage: string): string | undefined => {
  if (!stack)
    return stack
  const firstNl = stack.indexOf('\n')
  if (firstNl === -1)
    return undefined
  const tail = stack.slice(firstNl + 1)
  if (!originalMessage)
    return tail
  return tail
    .split('\n')
    .filter(line => !line.includes(originalMessage))
    .join('\n')
}

export const redactErrorForLog = (err: unknown): { name: string, message: string, stack?: string } => {
  if (err instanceof Error) {
    return {
      name: err.name,
      message: '<vault error: redacted>',
      stack: stripStackHeader(err.stack, err.message),
    }
  }
  return { name: 'NonError', message: '<vault error: redacted>' }
}
