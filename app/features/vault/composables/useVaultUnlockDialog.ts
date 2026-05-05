/**
 * Global controller for the vault unlock dialog (T-V-23).
 *
 * Singleton-style refs keyed by `useState` so the lock indicator in the
 * top nav and the dialog itself can share state across the app shell.
 * Components opt into the dialog by calling `openVaultUnlockDialog()`;
 * the dialog watches the ref and renders.
 */

export const useVaultUnlockDialog = () => {
  const isOpen = useState('vault.unlockDialog.open', () => false)

  const open = () => {
    isOpen.value = true
  }
  const close = () => {
    isOpen.value = false
  }

  return { isOpen, open, close }
}
