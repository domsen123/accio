/**
 * Clipboard helper for vault secrets (T-V-26, REQ-VAULT-12).
 *
 * Writes the value to the clipboard, sets a "copied" flag for the
 * caller's UI badge, then schedules a clear after `clearAfterMs`
 * (default 30s). The clear is best-effort: browsers may have already
 * surfaced the clipboard via OS-level history; document the limitation
 * (T-V-NTH-1).
 */

const DEFAULT_CLEAR_MS = 30_000

export interface SecretClipboardOptions {
  clearAfterMs?: number
}

export const useSecretClipboard = () => {
  const copiedKey = ref<string | null>(null)
  let clearTimer: ReturnType<typeof setTimeout> | null = null
  let lastValue = ''

  const cancelClearTimer = () => {
    if (clearTimer !== null) {
      clearTimeout(clearTimer)
      clearTimer = null
    }
  }

  const copy = async (
    value: string,
    key: string,
    options: SecretClipboardOptions = {},
  ): Promise<boolean> => {
    if (!value)
      return false
    cancelClearTimer()
    if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) {
      return false
    }
    try {
      await navigator.clipboard.writeText(value)
      copiedKey.value = key
      lastValue = value
      const clearAfter = options.clearAfterMs ?? DEFAULT_CLEAR_MS
      clearTimer = setTimeout(() => {
        // Best-effort clear: only stomp the clipboard if the user hasn't
        // copied anything else since (we read back; a mismatch means we
        // should leave their new value alone).
        navigator.clipboard.readText?.()
          .then((current) => {
            if (current === lastValue)
              navigator.clipboard.writeText('')
          })
          .catch(() => {
            // readText is permission-gated; fall back to unconditional clear.
            navigator.clipboard.writeText('').catch(() => undefined)
          })
        copiedKey.value = null
        clearTimer = null
      }, clearAfter)
      return true
    }
    catch {
      return false
    }
  }

  onUnmounted(cancelClearTimer)

  return { copy, copiedKey }
}
