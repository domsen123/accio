import { container } from '../utils/container'

// Starts the periodic vault-session sweeper. The store evicts idle sessions
// after the configured inactivity timeout (default 30 min, REQ-VAULT-4) and
// zeros their master-key buffers. The Nitro plugin only spins up the timer;
// the store itself manages state.
export default defineNitroPlugin((nitroApp) => {
  container.vaultSessionStore.start()

  nitroApp.hooks.hook('close', () => {
    container.vaultSessionStore.stop()
  })
})
